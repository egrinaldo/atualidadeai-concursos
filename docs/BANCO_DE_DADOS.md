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

## Migração 12 — Etapa 2.1 (notícias, IA, edições, PDFs e fila)

Reversão documentada em `supabase/rollback/20261105200000_etapa2_estrutura_noticias.down.sql`.

| Tabela | Finalidade |
| --- | --- |
| `news_categories` | 17 categorias editoriais |
| `news_source_groups` | Grupo editorial das fontes (independência na verificação) |
| `news_sources` | Fontes (RSS/Atom/API/HTML), alcance, UF, hosts permitidos (anti-SSRF), saúde da coleta |
| `news_clusters` | Assunto/acontecimento que agrupa matérias de várias fontes; relevância e status editorial |
| `news` | Notícias coletadas; `url_hash` único (deduplicação), `content_hash`, texto do feed por 30 dias |
| `news_verifications` | Histórico de verificações por assunto (6 classificações, evidências, fontes independentes) |
| `news_analyses` | Análises da IA (campos editoriais + JSON validado); reaproveitamento por `input_hash` |
| `editorial_reviews` | Auditoria das decisões humanas |
| `editions` / `edition_items` | Edição diária/semanal/mensal por UF e os itens por bloco (estado/nacional/internacional) |
| `generated_documents` | PDF base por edição, com versão, checksum e resultado do QA |
| `document_deliveries` | Entrega individual (área/e-mail), idempotente por documento+usuário+canal |
| `processing_jobs` | Fila do worker (`claim_jobs`, `finish_job`) |
| `ai_usage_logs` | Consumo e falhas da IA |
| `app_settings` | Configurações editáveis pelo painel (UFs piloto, horários, modelos, orçamento diário) |

Acesso: RLS em todas; escrita só pelo backend. O assinante lê apenas as próprias linhas de `document_deliveries`.
Storage: bucket **privado** `documents` (somente PDF, até 20 MB). Retenção ampliada em `apply_retention()`.

## Migração 13 — Etapa 2.2 (fontes e coleta)

- `news_sources.language` (`pt`, `en`, `es`, `fr`).
- `source_fetch_logs`: uma linha por tentativa de coleta (status `ok`/`not_modified`/`blocked_robots`/`error`, HTTP, itens, novos, duplicados, erro, duração). RLS ligado, acesso só do worker/admin. Retenção 90 dias (`apply_retention`).
- Cadastro de 19 grupos e 24 fontes (18 ativas), idempotente (`where not exists` por `feed_url`). Motivos de inativação em `terms_notes`.

## Migração 14 — Etapa 2.3 (triagem e agrupamento)

- `news`: `relevance_score` (0–100), `triage_reasons` (jsonb com as regras aplicadas), `triaged_at`; índice parcial da fila de triagem.
- `news_clusters`: `relevance_score`, `source_count` (fontes independentes); índice por bloco/relevância.
- Fonte da Comissão Europeia: idioma corrigido para `en`.
- `app_settings`: `triage.min_relevance_for_edition` (`media`), `triage.cluster_window_hours` (72), `triage.similarity_threshold` (0,38).
- Reversão: `supabase/rollback/20261106000000_etapa2_triagem_e_agrupamento.down.sql`.

## Migração 15 — Etapa 2.4 (verificação)

- `news_clusters`: `verification_status`, `verification_confidence`, `needs_review`, `verified_at` (resumo da verificação mais recente; histórico em `news_verifications`) e `members_changed_at` (quando o assunto ganhou matérias — dispara reverificação).
- Índices da fila de verificação e da fila de revisão.
- `app_settings`: `verification.edition_statuses`, `verification.single_source_min_reliability` (4).
- Reversão: `supabase/rollback/20261106020000_etapa2_verificacao.down.sql`. Regras: `docs/VERIFICACAO_INFORMACOES.md`.

## Migração 16 — Etapa 2.5 (IA)

- `app_settings`: `ai.models` preenchido com os modelos verificados (só se estava vazio), `ai.analysis_per_block`, `ai.max_calls_per_run` (6), `ai.lookback_hours` (36).
- Índices: `ai_usage_logs (created_at)` para a cota diária; `news_analyses (cluster_id, input_hash, prompt_version, status)` para reaproveitamento.
- Reversão: `supabase/rollback/20261106040000_etapa2_ia.down.sql`. Detalhes: `docs/IA_NVIDIA.md`.

## Migração 17 — Etapa 2.5b (veículos de imprensa)

- `news_sources.content_mode` (`full` | `summary`): no modo resumo só título + resumo de até 400 caracteres são gravados (`original_content` fica nulo).
- Novo tipo de fonte `sitemap` (mapa de notícias no padrão Google News).
- 24 grupos editoriais novos; 41 fontes de imprensa cadastradas (29 ativas, 14 inativas com motivo em `terms_notes`, incluindo as já existentes de G1/BBC/CNN Brasil atualizadas).
- Reversão: `supabase/rollback/20261106060000_etapa2_veiculos_imprensa.down.sql` (desativa os veículos; notícias já coletadas são preservadas).

## Migração 18 — Etapa 2.6 (edições e PDFs)

- `app_settings`: `edition.items_per_block` (diária/semanal/mensal por bloco) e `edition.template_version`.
- Índices: `editions (reference_date, state, edition_type)` e `generated_documents (edition_id, version)`.
- Reversão: `supabase/rollback/20261106080000_etapa2_edicoes_pdf.down.sql`. Fluxo: `docs/GERACAO_PDF.md`.

## Migração 19 — Etapa 2.7 (painel editorial)

- `editorial_reviews`: novos alvos (`setting`) e ações (`hold`, `add_item`, `remove_item`, `move_item`, `create`, `update`).
- Índices: decisões por revisor; assuntos aguardando revisão.
- Reversão: `supabase/rollback/20261106100000_etapa2_painel_editorial.down.sql`. Uso: `docs/PAINEL_EDITORIAL.md`.
