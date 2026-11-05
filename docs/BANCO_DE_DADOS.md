# Banco de dados

> **Status:** criado na Subetapa 3. Scripts em `supabase/migrations/` (executar em ordem). Testado com 72 verificações automáticas (ver "Testes").

## Diagrama

```
auth.users (Supabase Auth — senhas ficam AQUI, nunca nas tabelas públicas)
   │ 1:1  (trigger on_auth_user_created cria perfil + preferências)
   ▼
profiles ──1:1── user_preferences
   │
   │ 1:N                         plans
   ▼                               │ 1:N
subscriptions ◄────────────────────┘
   │ 1:N
   ▼
payments            leads (independente; gravado via capture_lead)
```

## Tabelas

### profiles
| Coluna | Tipo | Regras |
| --- | --- | --- |
| id | uuid PK | = `auth.users.id`; excluído junto com o usuário |
| full_name | text | até 120 caracteres |
| email | text | único (sem diferenciar maiúsculas); sincronizado com o Auth |
| state | char(2) | UF em maiúsculas (`CE`) ou nulo |
| city | text | até 120 caracteres |
| terms_accepted_at | timestamptz | preenchido no cadastro se `terms_accepted = true` |
| created_at / updated_at | timestamptz | `updated_at` automático |

### plans
| Coluna | Tipo | Regras |
| --- | --- | --- |
| id | uuid PK | |
| code | text único | identificador estável (`mensal`) |
| name, description | text | |
| price | numeric(10,2) | ≥ 0 — **preço configurável aqui** |
| currency | char(3) | padrão `BRL` |
| billing_period | text | `monthly` / `quarterly` / `yearly` |
| is_active | boolean | só planos ativos aparecem no site |
| created_at / updated_at | timestamptz | |

Registro inicial: **`mensal` — Assinatura mensal — R$ 10,00 — monthly — ativo**.

### subscriptions
| Coluna | Tipo | Regras |
| --- | --- | --- |
| id | uuid PK | |
| user_id | uuid → profiles | excluída junto com o usuário |
| plan_id | uuid → plans | plano não pode ser apagado se tiver assinaturas |
| provider | text | `mercadopago` |
| external_subscription_id | text único | ID da assinatura no Mercado Pago |
| status | text | `pending` · `active` · `paused` · `cancelled` · `expired` |
| started_at / expires_at | timestamptz | `expires_at ≥ started_at` |
| created_at / updated_at | timestamptz | |

Regra: **no máximo uma assinatura `active` por usuário** (índice único parcial).

### payments
| Coluna | Tipo | Regras |
| --- | --- | --- |
| id | uuid PK | |
| user_id | uuid → profiles | vira nulo se o usuário for excluído (histórico preservado) |
| subscription_id | uuid → subscriptions | idem |
| provider | text | `mercadopago` |
| external_payment_id | text **único** | garante **idempotência** do webhook |
| amount | numeric(10,2) | ≥ 0 |
| currency | char(3) | `BRL` |
| status | text | status do Mercado Pago: `pending`, `approved`, `authorized`, `in_process`, `in_mediation`, `rejected`, `cancelled`, `refunded`, `charged_back` |
| status_detail | text | detalhe retornado pelo Mercado Pago |
| paid_at | timestamptz | |
| created_at / updated_at | timestamptz | |

### user_preferences
| Coluna | Tipo | Regras |
| --- | --- | --- |
| id | uuid PK | |
| user_id | uuid → profiles, **único** | 1 registro por usuário |
| state, city | | mesmas regras de profiles |
| interests | text[] | até 30 itens |
| created_at / updated_at | timestamptz | |

### Colunas adicionadas em subscriptions (migração 5)
| Coluna | Uso |
| --- | --- |
| provider_status | status original no Mercado Pago (`pending`, `authorized`, `paused`, `cancelled`) |
| next_payment_at | próxima cobrança prevista |
| cancelled_at | data do cancelamento |
| checkout_url | link do checkout para concluir um pagamento pendente |

### payment_events (migração 5)
Auditoria de toda notificação/sincronização com o Mercado Pago: `source` (`webhook`, `sync`, `checkout`), `topic`, `action`, `resource_id`, `request_id`, `signature_valid`, `status` (`received`, `processed`, `ignored`, `failed`, `rejected`), `error`, `payload`, `received_at`, `processed_at`. **Somente o backend acessa** (RLS sem políticas, sem GRANT para o navegador).

### Conciliação agendada (migração 6)
Extensões `pg_cron` e `pg_net`. Tarefa `mp-reconcile` a cada 6 horas (minuto 17) chama a Edge Function `mp-reconcile`. URL e segredo são lidos do **Supabase Vault** (`mp_reconcile_url`, `cron_secret`) — não ficam no repositório. Consultar execuções: `select * from cron.job_run_details order by start_time desc limit 10;`

### email_log (migração 7)
Registro dos e-mails transacionais: `kind`, `dedupe_key` (**única** — impede duplicidade), `to_email`, `delivered_to` (destino efetivo; difere em modo de teste), `subject`, `status` (`sending`, `sent`, `failed`, `skipped`), `provider`, `provider_message_id`, `attempts`, `error`, `sent_at`. Somente o backend acessa.

### leads
| Coluna | Tipo | Regras |
| --- | --- | --- |
| id | uuid PK | |
| name | text | 1–120 caracteres |
| email | text | formato validado; único sem diferenciar maiúsculas |
| state, city | | |
| source | text | padrão `landing` |
| created_at / updated_at | timestamptz | |

## Segurança (GRANTs + RLS)

| Tabela | Visitante (`anon`) | Usuário logado (`authenticated`) | Backend (`service_role`) |
| --- | --- | --- | --- |
| profiles | — | lê o próprio; altera **só** nome, UF e cidade | total |
| plans | lê ativos | lê ativos | total |
| subscriptions | — | lê as próprias | total |
| payments | — | lê os próprios | total |
| user_preferences | — | lê, cria e altera as próprias | total |
| leads | — (só via `capture_lead`) | — (só via `capture_lead`) | total |

- Assinaturas e pagamentos **nunca** são gravados pelo navegador — somente pelas Edge Functions (Subetapa 5), após consultar a API do Mercado Pago.
- Desde 30/10/2026 o Supabase exige permissões (GRANT) explícitas para tabelas novas; os scripts já as definem.

## Funções

| Função | Uso |
| --- | --- |
| `handle_new_user()` | Trigger: cria `profiles` e `user_preferences` no cadastro, usando `full_name`, `state`, `city`, `terms_accepted` enviados no `signUp` (Subetapa 4). UF inválida não bloqueia o cadastro (fica nula). |
| `handle_user_email_change()` | Trigger: mantém `profiles.email` igual ao e-mail do Auth. |
| `capture_lead(p_name, p_email, p_state, p_city)` | Única forma de o site gravar leads. Valida e normaliza; e-mail repetido não gera erro nem sobrescreve dados. |
| `set_updated_at()`, `normalize_uf()`, `normalize_text()` | Utilitárias. |

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| `supabase/migrations/20261104120000_schema_inicial.sql` | Tabelas, restrições, índices, triggers de `updated_at` |
| `supabase/migrations/20261104120100_rls_e_permissoes.sql` | GRANTs e políticas RLS |
| `supabase/migrations/20261104120200_funcoes_cadastro_e_leads.sql` | Funções e triggers de cadastro e leads |
| `supabase/migrations/20261104120300_dados_iniciais_planos.sql` | Plano mensal de R$ 10,00 |
| `supabase/migrations/20261104130000_pagamentos_mercado_pago.sql` | Colunas de controle da assinatura e `payment_events` |
| `supabase/migrations/20261104150000_registro_de_emails.sql` | Tabela `email_log` |
| `supabase/migrations/20261104140000_conciliacao_agendada.sql` | `pg_cron` + `pg_net`: conciliação a cada 6 h (segredos no Vault) |
| `supabase/verificacao.sql` | Checagem pós-instalação (somente leitura) |

Todos os scripts são **reexecutáveis**: rodar de novo não causa erro nem duplica dados.

## Operações comuns (SQL Editor)

```sql
-- Alterar o preço
update public.plans set price = 12.90 where code = 'mensal';

-- Ver leads mais recentes
select name, email, state, city, created_at from public.leads order by created_at desc limit 50;

-- Ver assinaturas ativas
select p.full_name, p.email, s.status, s.started_at
from public.subscriptions s join public.profiles p on p.id = s.user_id
where s.status = 'active';
```

## Testes

As migrações foram executadas duas vezes seguidas em PostgreSQL real (PGlite), com simulação do schema `auth` e dos papéis do Supabase. **72 verificações aprovadas**, incluindo:
- criação automática de perfil e normalização de dados no cadastro;
- isolamento entre usuários (A não vê nem altera dados de B);
- visitante sem acesso a perfis, assinaturas, pagamentos e leads;
- usuário não altera e-mail, aceite de termos, assinaturas ou pagamentos;
- idempotência de pagamentos e limite de uma assinatura ativa;
- exclusão de usuário remove dados pessoais e preserva o histórico de pagamentos.

Limitação: o teste simula o ambiente Supabase; a validação final é feita no projeto real com `supabase/verificacao.sql` e `npm run check:supabase`.

## Migração 9 — `admins` (área administrativa)

| Coluna | Tipo | Descrição |
| --- | --- | --- |
| `user_id` | uuid PK → `auth.users` | Usuário com acesso ao painel `/admin` |
| `note` | text | Observação (ex.: "Responsável pelo projeto") |
| `created_at` | timestamptz | Inclusão |

RLS ativo: usuário autenticado lê **apenas o próprio** registro (para exibir o botão do painel). Sem permissão de inserir/alterar pelo site; inclusão manual via SQL. Os dados do painel são lidos pela Edge Function `admin` após conferir esta tabela.

## Migração 10 — endurecimento de segurança (auditoria 05/11/2026)

- Privilégios padrão do schema `public` (papel `postgres`): novos objetos **não** são liberados a `anon`/`authenticated`.
- `user_preferences`: INSERT em (`user_id`, `state`, `city`, `interests`); UPDATE só em (`state`, `city`, `interests`).
- `rate_limits` (`key`, `window_start`, `hits`) + `rate_limit_hit(chave, máximo, janela_segundos)` — somente `service_role`.
- `capture_lead`: limite de 10 por IP/hora e 300/hora no total.
- `payment_events.signature_ts`: deduplicação de reenvios do webhook.
- `apply_retention()` + pg_cron `lgpd-retencao` (diário, 06:41 UTC): `payment_events` > 12 meses, `email_log` > 24 meses, leads não convertidos > 24 meses, `rate_limits` > 2 dias. `payments` nunca são apagados.

## Migração 11 — `access_logs` (Marco Civil da Internet, art. 15)

| Coluna | Descrição |
| --- | --- |
| `user_id` | Usuário (sem chave estrangeira: o registro permanece pelo prazo legal mesmo após a exclusão da conta) |
| `ip`, `user_agent`, `aal` | Endereço IP, navegador e nível de autenticação da sessão |
| `accessed_at` | Data e hora do login |

Preenchida pelo gatilho `on_auth_session_created` (cada nova sessão do Supabase Auth). RLS ativo, sem acesso para `anon`/`authenticated`. Eliminação automática após 6 meses pela rotina `apply_retention`.
