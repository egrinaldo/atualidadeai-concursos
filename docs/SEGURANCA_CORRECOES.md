# Correções de segurança — AtualidadeAI Concursos

Auditoria de 05/11/2026 (ver `SEGURANCA_AUDITORIA.md`). Branch `seguranca/auditoria`, commit `5978b6b` (código) + commit de documentação. Versão 0.9.0.

## 1. Correções por vulnerabilidade

### V01 (crítica) — sequestro de contas pelo endereço curinga
| | |
| --- | --- |
| Problema | Redirect URLs com `https://atualidadeai-concursos-*.vercel.app/**` + fluxo implícito: tokens de sessão iam na URL para um domínio que qualquer pessoa pode criar |
| Mitigação imediata | Curinga removido da configuração do Auth (lista: produção e `localhost:5173`, exatos) |
| Correção definitiva | Links de e-mail fixos em `{{ .SiteURL }}/confirmar-email?token_hash=…&type=email` e `{{ .SiteURL }}/redefinir-senha?token_hash=…&type=recovery`; páginas validam com `verifyOtp` e limpam a URL; cliente em `flowType: 'pkce'`; `configure-auth-email.ts` recusa curingas e não-https |
| Arquivos | `src/lib/supabase.ts`, `src/lib/auth.ts` (`verifyEmailLink`), `src/pages/auth/ConfirmarEmail.tsx`, `src/pages/auth/RedefinirSenha.tsx`, `supabase/functions/_shared/email/templates.ts`, `scripts/configure-auth-email.ts`, `supabase/functions/tests/emails.test.ts` |
| Impacto | Links enviados antes da troca deixaram de valer; links continuam funcionando em outro navegador/dispositivo |
| Evidência | Recuperação com destino `…-atacante.vercel.app` e `evil.example` → volta a `https://atualidadeai-concursos.vercel.app`; confirmação e recuperação por `token_hash` funcionam (local e produção); token removido da URL; link reutilizado recusado |

### V02 — redirecionamento aberto
- Solução: `safeNext` recusa `//`, barra invertida e caracteres de controle e confere a origem com `new URL()`.
- Arquivo: `src/pages/auth/Entrar.tsx`.
- Evidência: `next` = `/\example.com`, `/<tab>/example.com`, `//example.com`, `https://example.com`, `/\\example.com` → permanece no site (build local e produção).

### V03 — gravação de chamadas não autenticadas no webhook
- Solução: assinatura inválida só gera log da função (sem linha no banco); payload gravado limitado a 16.000 caracteres.
- Arquivo: `supabase/functions/mp-webhook/index.ts`.
- Evidência: chamada sem assinatura com 3–5 KB → 401 e zero linhas novas.

### V04 — abuso de cadastro/leads (parcial)
- Solução aplicada: `capture_lead` limitado a 10/IP/hora e 300/hora no total (excesso ignorado em silêncio, sem afetar o cadastro).
- Pendente: CAPTCHA (Cloudflare Turnstile) — depende de aprovação e conta.
- Arquivo: migração 10.
- Evidência: 12 chamadas do mesmo IP → 10 leads.

### V05 — limite de requisições
- Solução: tabela `rate_limits` + função `rate_limit_hit` (janela fixa, só `service_role`); limites: `mp-sync` 20/10 min, `mp-create-subscription` 5/10 min, `mp-cancel-subscription` 5/10 min, `account` 10/10 min, `admin` 120/min; resposta 429 com `Retry-After`. Em falha do banco, não bloqueia (para não impedir pagamentos).
- Arquivos: `_shared/db.ts` (`rateLimited`), `_shared/http.ts` (`tooManyRequests`), funções citadas, migração 10.
- Evidência: 20 chamadas a `mp-sync` → 200; 21ª → 429.

### V06 — privilégios padrão
- Solução: `alter default privileges for role postgres in schema public revoke all … from anon, authenticated`; funções utilitárias sem EXECUTE para o site.
- Arquivo: migração 10.
- Evidência: `pg_default_acl` do papel `postgres` sem `anon`/`authenticated`; visitante não executa `rate_limit_hit`, `apply_retention`, `normalize_text`.
- Residual: o papel interno `supabase_admin` não pode ser alterado pelo projeto (ver recomendações).

### V07 — MFA para administrador
- Solução: função `admin` exige sessão `aal2`; tela `MfaGate` conduz cadastro (QR code TOTP) e verificação.
- Arquivos: `supabase/functions/admin/index.ts`, `supabase/functions/_shared/db.ts` (`sessionAal`), `src/pages/admin/Mfa.tsx`, `src/pages/admin/Admin.tsx`.
- Evidência: sessão só com senha → 403 `mfa_required`; código errado recusado; código correto abre o painel; novo login pede só o código. Administrador real com fator TOTP verificado.

### V08 — direitos do titular e retenção (LGPD)
- Solução: Edge Function `account` (`export` e `delete` com confirmação de senha; exclusão cancela assinatura no Mercado Pago, apaga perfil, preferências, assinaturas, registros de e-mail e lead; pagamentos mantidos com `user_id = null`; administrador não se exclui por ali). Tela "Privacidade e dados" em `/conta`. Tarefa diária `lgpd-retencao`: `payment_events` 12 meses, `email_log` 24 meses, leads não convertidos 24 meses, `rate_limits` 2 dias.
- Arquivos: `supabase/functions/account/index.ts`, `src/lib/account.ts`, `src/components/account/PrivacyPanel.tsx`, `src/pages/auth/Conta.tsx`, `src/lib/auth.ts` (`signOut(scope)`), migração 10, `supabase/config.toml`.
- Evidência: exportação com todos os grupos de dados; senha errada → 403; administrador → 409; exclusão remove dados pessoais e mantém pagamento anônimo; fluxo completo pela tela.
- Pendente: textos de Termos de Uso e Política de Privacidade.

### V09 — reenvio de webhook
- Solução: coluna `payment_events.signature_ts`; notificação com mesmo `x-request-id` e `ts` já processada é descartada (`duplicate: true`). Não foi adotada janela de tempo para não rejeitar reenvios legítimos do Mercado Pago (a documentação consultada não define se reenvios trazem novo `ts`).
- Evidência: segundo envio idêntico → `{ ok: true, duplicate: true }`; assinatura forjada → 401.

### V10 — política de senha
- Solução: `password_min_length = 8` e `security_update_password_require_reauthentication = true` (também gravados pelo script).
- Evidência: senha de 6 caracteres → 422 `weak_password`; troca de senha após recuperação funciona.

### V11 — enumeração no cadastro
- Solução: e-mail já existente recebe a mesma resposta/tela de um cadastro novo; texto orienta "Esqueci minha senha". Corrigido também o prazo informado do link (1 hora, não 24).
- Arquivos: `src/lib/auth.ts`, `src/pages/auth/Cadastro.tsx`.
- Evidência: cadastro com e-mail existente mostra a tela "Enviamos um link de confirmação".

### V12 — estorno/contestação
- Solução: pagamento `refunded`/`charged_back` cancela a assinatura no Mercado Pago e registra `cancel_after_refund`.
- Arquivos: `_shared/mapping.ts` (`revokesAccess`), `_shared/sync.ts`, `tests/pagamentos.test.ts`.
- Evidência: teste automático.

### V13 — colunas de `user_preferences`
- Solução: INSERT em (`user_id`, `state`, `city`, `interests`) e UPDATE só em (`state`, `city`, `interests`).
- Evidência: trocar `user_id` → 403; alterar cidade → 200.

### Informativas tratadas
- I4: `supabase-js` fixado em `2.119.0` nas funções; Vite 8.3.6.

## 2. Migração e implantação

| Item | Situação |
| --- | --- |
| Migração 10 `20261105160000_endurecimento_seguranca.sql` | Aplicada 2× (reexecutável), sem remoção de dados |
| Edge Functions | 8 publicadas (`account` nova; demais atualizadas) |
| Supabase Auth | Redirect URLs exatas, modelos com `token_hash`, senha 8, reautenticação |
| Frontend | Publicado pelo responsável (PR para `develop` e `main`) |

## 3. Testes executados (Etapa 5)

| Bateria | Resultado |
| --- | --- |
| Banco/funções/Auth (API, Supabase real) | 54/54 (uma verificação do script foi corrigida: `/**` não é curinga de domínio) |
| RLS (dentro da bateria acima) | 28/28 |
| Telas (build novo + CSP de produção, Playwright) | 25/25, 0 violações de CSP, 320 px sem rolagem lateral |
| Produção (após publicação) | 9/9 (recuperação por `token_hash`, V02, privacidade, `/admin` restrito, CSP, responsivo) |
| Regressão de pagamento (sandbox) | Checkout criado; assinatura pendente sem pagamento; cancelamento OK (1ª tentativa recebeu `429 local_rate_limited` do Mercado Pago; repetida com sucesso) |
| Deno | 22/22 |
| `npm audit` | 0 vulnerabilidades |
| TypeScript e build | OK |
| Segredos (árvore, histórico, bundle) | Nenhum |
| Supabase Security Advisor | Nenhum ERROR (avisos aceitos documentados) |

Todos os dados de teste foram removidos após cada bateria.
