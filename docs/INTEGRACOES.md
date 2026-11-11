# Integrações

| Integração | Status | Subetapa | Ponto de entrada no código |
| --- | --- | --- | --- |
| Supabase (Auth + banco) | Banco aplicado e Auth integrado (cadastro, login, confirmação, recuperação) | 3 e 4 | `src/lib/supabase.ts`, `src/config/env.ts` |
| Mercado Pago | Assinatura mensal em **produção** desde 11/11/2026 (R$ 9,99/mês) | 5 | `supabase/functions/mp-*`, `src/lib/billing.ts` |
| Serviço de e-mail (Resend) | Integrado: login do Supabase via SMTP + e-mails de pagamento via API; **modo de teste** (sem domínio) | 6 | `supabase/functions/_shared/email/` |
| Vercel | Preparada — `vercel.json` | 7 | `vercel.json` |

## Supabase

- O frontend usa apenas a **Publishable key** (ou a *anon key* legada). Ela é pública por design; a proteção dos dados vem das políticas **RLS**.
- `supabase` é `null` enquanto não configurado. Use `getSupabase()` quando a operação exigir o cliente.
- Tipos do banco em `src/types/database.ts` (cliente tipado: `createClient<Database>`).
- Verificação: `npm run check:supabase` (terminal) e `/status` (navegador, só em desenvolvimento) — `src/lib/supabaseHealth.ts`.
- Leads: `supabase.rpc('capture_lead', { p_name, p_email, p_state, p_city })`.
- Cadastro: `src/lib/auth.ts` → `signUp` envia `full_name`, `state`, `city`, `terms_accepted` em `options.data`; o trigger cria o perfil. E-mail já cadastrado é detectado pela resposta sem identidades (o Supabase não revela isso como erro).
- Links de e-mail: `/confirmar-email` (cadastro) e `/redefinir-senha` (recuperação) — ambos precisam estar em **Authentication → URL Configuration → Redirect URLs**.
- Erros do Supabase traduzidos em `translateAuthError` (credenciais, e-mail não confirmado, limite de envio, e-mail não autorizado etc.).
- **Limitação atual:** o envio de e-mail padrão do Supabase só entrega para membros da equipe do projeto e no máximo 2 e-mails/hora. Cadastros de público real dependem de SMTP próprio (Subetapa 6).

## Mercado Pago (Subetapa 5)

### Fluxo

```
Site (/conta) ── "Assinar agora" ──► mp-create-subscription ──► POST /preapproval (status pending)
                                         │  grava subscriptions(status=pending, external_subscription_id, checkout_url)
                                         ▼
                              checkout do Mercado Pago (cartão)
                                         │
             back_url ◄──────────────────┤                       notificação (webhook)
                │                        │                                │
     /pagamento/retorno ──► mp-sync ─────┴──► GET /preapproval ◄── mp-webhook (valida x-signature)
                                              GET /authorized_payments        │
                                                     │                        │
                                                     ▼                        ▼
                                  subscriptions.status=active  +  payments (upsert idempotente)
pg_cron (a cada 6 h) ──► mp-reconcile ──► mesma sincronização para todas as assinaturas em andamento
```

### Edge Functions (`supabase/functions/`)

| Função | Acesso | Responsabilidade |
| --- | --- | --- |
| `mp-create-subscription` | usuário logado | Cria assinatura local `pending` + preapproval no Mercado Pago; devolve o link do checkout; reaproveita/substitui pendentes; bloqueia quem já tem assinatura ativa |
| `mp-webhook` | Mercado Pago (sem login) | Valida `x-signature` (HMAC-SHA256), registra em `payment_events`, **consulta a API** e atualiza o banco |
| `mp-sync` | usuário logado | Consulta o Mercado Pago e atualiza a assinatura do usuário (página de retorno, botão "Já paguei") |
| `mp-cancel-subscription` | usuário logado | Cancela no Mercado Pago e no banco |
| `mp-reconcile` | pg_cron (`x-cron-secret`) | Conciliação a cada 6 h — rede de segurança se um webhook se perder |
| `mp-return` | público | Endereço de retorno https enquanto o site roda em `http://localhost` (redireciona apenas para `SITE_URL`) |

Módulos compartilhados em `_shared/`: `signature.ts` (validação), `mapping.ts` (regras de status/valor), `mercadopago.ts` (cliente da API), `sync.ts` (aplicação no banco), `db.ts`, `http.ts`.

### Regras de segurança implementadas

- Access Token e assinatura secreta **só** nos Secrets das Edge Functions; nunca no navegador.
- **Não ativa pela URL de retorno:** a página de retorno chama `mp-sync`, que consulta a API; parâmetros da URL são ignorados.
- **Webhook autenticado:** manifesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` + HMAC-SHA256 com a assinatura secreta; comparação em tempo constante; inválido → 401.
- **Nunca confia no corpo da notificação:** sempre busca o recurso na API (`/preapproval`, `/authorized_payments`, `/v1/payments`).
- **Idempotência:** `payments.external_payment_id` único + upsert; reprocessar a mesma notificação não duplica; testado com notificações repetidas e sincronizações em sequência.
- **Valor conferido:** a assinatura só é ativada se valor e moeda no Mercado Pago forem iguais aos do plano.
- Nenhum dado de cartão passa pelo site ou é armazenado.
- Respostas do webhook: 200 (processado/ignorado), 401 (assinatura inválida), 500 (falha temporária → o Mercado Pago reenvia).

### Mapeamento de status

| Mercado Pago (preapproval) | Banco (`subscriptions.status`) |
| --- | --- |
| `pending` | `pending` |
| `authorized` | `active` |
| `paused` | `paused` |
| `cancelled` | `cancelled` |
| `finished` / `expired` | `expired` |

Pagamentos guardam o status do Mercado Pago (`approved`, `rejected`, `in_process`, `refunded`, `charged_back`…).

### Particularidades do Mercado Pago (aprendidas nos testes)

- `back_url` precisa ser **https público** — `localhost` é recusado (por isso a função `mp-return` em desenvolvimento).
- Vendedor de teste só negocia com **comprador de teste** ("Both payer and collector must be real or test users").
- O pagador precisa entrar no checkout com a conta do Mercado Pago **do e-mail informado na assinatura** — por isso o site pede "E-mail da sua conta Mercado Pago" antes do pagamento.
- No ambiente de teste, o Mercado Pago **não disparou webhooks para eventos reais** das contas de teste (apenas a simulação do painel chegou, e foi validada). Ativação e cancelamento foram confirmados pela sincronização; a conciliação agendada cobre esse cenário.
- O checkout do Mercado Pago bloqueia navegadores automatizados: o pagamento de teste precisa ser feito manualmente.

## E-mails (Subetapa 6)

### Dois caminhos de envio
| E-mail | Quem envia | Como |
| --- | --- | --- |
| Confirmação de cadastro, recuperação de senha | **Supabase Auth** | SMTP do Resend (`smtp.resend.com:465`), modelos em português aplicados por `npm run auth:email` |
| Confirmação de contratação, orientações iniciais, pagamento aprovado/pendente/recusado | **Edge Functions** | API do Resend, disparados por `_shared/sync.ts` nas mudanças de estado |

### Arquivos
| Arquivo | Papel |
| --- | --- |
| `_shared/email/provider.ts` | **Único ponto acoplado ao provedor** (Resend). Trocar de serviço = implementar `EmailProvider` aqui. Inclui provedor `log` (não envia). |
| `_shared/email/templates.ts` | Modelos (HTML compatível com clientes de e-mail + texto). **Textos editáveis aqui.** |
| `_shared/email/notify.ts` | Envio idempotente: `email_log.dedupe_key` única; até 3 tentativas em caso de falha; falhas nunca travam o processamento do pagamento. |
| `scripts/send-email-samples.ts` | `npm run email:samples` — envia um exemplo de cada e-mail para `EMAIL_TEST_TO`. |
| `scripts/configure-auth-email.ts` | `npm run auth:email` — configura SMTP, modelos, Site URL e Redirect URLs do Supabase Auth. |

### Quando cada e-mail é enviado
| Evento | E-mail | Chave anti-duplicidade |
| --- | --- | --- |
| Assinatura passa a `active` pela 1ª vez | Confirmação de contratação | `subscription:<id>:activated` |
| Idem (uma vez por usuário) | Orientações iniciais | `user:<id>:welcome` |
| Pagamento `approved` | Pagamento aprovado | `payment:<id>:pagamento_aprovado` |
| Pagamento `pending`/`in_process` | Pagamento pendente | `payment:<id>:pagamento_pendente` |
| Pagamento `rejected` | Pagamento recusado | `payment:<id>:pagamento_recusado` |

### Modo de teste (atual)
- Sem domínio próprio, o Resend só entrega para o e-mail da conta Resend, a partir de `onboarding@resend.dev`.
- O secret `EMAIL_TEST_TO` redireciona **todos** os e-mails transacionais para esse endereço; o assunto indica o destinatário original (`[TESTE → fulano@...]`).
- E-mails do login (Supabase Auth) só chegam para o e-mail da conta Resend até o domínio ser verificado.
