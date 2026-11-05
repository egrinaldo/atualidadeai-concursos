# Manutenção

## Rotina de alteração

1. `git checkout develop` → altere → `npm run build` (precisa passar) → commit → `git push`.
2. Abra a prévia da Vercel e confira.
3. Pull Request `develop → main` no GitHub → Merge → produção atualizada.
4. Problema em produção: Vercel → Deployments → versão anterior → **Instant Rollback**.

## Painel administrativo (`/admin`)

- Acesso: entrar com a conta de administrador → **Minha conta → Painel administrativo** (ou abrir `/admin`).
- Indicadores excluem as contas de administrador. Meses no fuso de Fortaleza.
- MRR = assinaturas ativas × preço do plano; receita = pagamentos **aprovados** (data do pagamento).
- Cancelar pelo painel interrompe as cobranças no Mercado Pago (irreversível).

Incluir outro administrador (SQL Editor do Supabase; a pessoa precisa ter conta no site):

```sql
insert into public.admins (user_id, note)
select id, 'Motivo / nome' from auth.users where email = 'pessoa@exemplo.com';
```

Remover: `delete from public.admins where user_id = (select id from auth.users where email = 'pessoa@exemplo.com');`

Publicar mudanças na função: `npx supabase functions deploy admin`.

**MFA (obrigatório):** o primeiro acesso ao painel pede para escanear um QR code num app autenticador; depois, cada login pede o código de 6 números. Perdeu o celular? No SQL Editor: `delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'admin@exemplo.com');` — o próximo acesso pede novo cadastro.

## Direitos do titular (LGPD)

Em **Minha conta → Privacidade e dados** o usuário baixa seus dados (JSON) ou exclui a conta (confirmação por senha). A exclusão cancela a assinatura no Mercado Pago, apaga perfil, preferências, assinaturas, registros de e-mail e lead, e mantém os pagamentos sem identificação. Retenção automática: ver `docs/BANCO_DE_DADOS.md` (migração 10).

## Segurança

Relatórios e checklist: `docs/SEGURANCA_AUDITORIA.md`, `docs/SEGURANCA_CORRECOES.md`, `docs/SEGURANCA_RECOMENDACOES.md`.

## Onde editar

| O quê | Arquivo |
| --- | --- |
| Textos da landing, FAQ | `src/content/landing.ts` |
| Preço e itens do plano (site) | `src/content/plans.ts` **e** tabela `plans` no banco (o valor cobrado vem do banco) |
| E-mails transacionais e de login | `supabase/functions/_shared/email/templates.ts` (login: rodar `npm run auth:email` depois) |
| Regras de pagamento | `supabase/functions/_shared/sync.ts`, `mapping.ts` |
| Banco de dados | nova migração em `supabase/migrations/` (nunca editar as já aplicadas) |

## Publicar Edge Functions e migrações

```bash
npx supabase login                       # uma vez
npx supabase link --project-ref <ref>    # uma vez
npx supabase functions deploy            # após mudar supabase/functions
npx supabase db push                     # após criar migração
```

Secrets: `npx supabase secrets list` / `npx supabase secrets set NOME=valor`.

## Monitoramento

| Onde | O que olhar |
| --- | --- |
| Vercel → Deployments / Logs | builds com erro, acessos |
| Supabase → Edge Functions → Logs | erros de `mp-webhook`, `mp-create-subscription`, `mp-reconcile` |
| Banco: tabela `payment_events` | cada notificação recebida e se foi processada |
| Banco: tabela `email_log` | e-mails enviados / com falha |
| Supabase → Advisors | alertas de segurança e desempenho |
| Mercado Pago → Suas integrações → Webhooks | entregas e falhas de notificação |
| Resend → Emails | entregas, rejeições |

Consulta rápida de saúde: `npm run check:supabase`.

## Checklist antes de vender (cobranças reais)

1. Autorização expressa do responsável pelo projeto.
2. Vercel → plano **Pro**.
3. Domínio próprio na Vercel e verificado no Resend; `EMAIL_FROM` com o domínio; remover `EMAIL_TEST_TO` e `MERCADO_PAGO_TEST_PAYER_EMAIL`.
4. Credenciais de **produção** do Mercado Pago (CONFIGURACAO §4.8) e novo segredo de webhook.
5. Termos de uso e política de privacidade publicados.
6. Uma compra real de baixo valor para validar e, se preciso, estorno.

## Segurança contínua

- Remover `SUPABASE_DB_URL` e `SUPABASE_ACCESS_TOKEN` do `.env` quando não forem mais necessários; trocar a senha do banco e revogar o token em Supabase → Account → Access Tokens.
- Renovar credenciais se houver suspeita de vazamento (Mercado Pago, Resend, Supabase).
- `npm audit` mensalmente; atualizar dependências na `develop` e testar antes do merge.
