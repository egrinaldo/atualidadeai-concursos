# Recomendações de segurança — AtualidadeAI Concursos

Complementa `SEGURANCA_AUDITORIA.md` e `SEGURANCA_CORRECOES.md` (05/11/2026).

## 1. Pendências que dependem do responsável pelo projeto

| Prioridade | Item | O que fazer |
| --- | --- | --- |
| Alta | **V14 — rotação de credenciais** | 1) Mercado Pago → Suas integrações → Credenciais: renovar as credenciais de teste e o segredo do webhook; 2) Supabase → Account → Access Tokens: revogar o token pessoal usado no desenvolvimento; 3) Supabase → Database → trocar a senha do banco; 4) atualizar o `.env` local (sem colar no chat) e pedir a atualização dos *Secrets* das funções |
| Alta | **Limpar o `.env` local** | Remover `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL` e `MERCADO_PAGO_TEST_BUYER_PASSWORD` quando não forem necessários |
| Média | **V04 — CAPTCHA** | Criar site no Cloudflare Turnstile (gratuito) e autorizar a integração no cadastro e na recuperação de senha (Supabase Auth suporta nativamente; exige ajuste na CSP) |
| Média | **V08 — documentos jurídicos** | Publicar Termos de Uso e Política de Privacidade (finalidades, bases legais, compartilhamento com Supabase, Mercado Pago, Resend e Vercel, prazos de retenção abaixo, canal do encarregado/DPO). Recomenda-se revisão por advogado |
| Média | **MFA — códigos de recuperação** | Guardar a chave TOTP em local seguro. Se o celular for perdido, o fator pode ser removido por SQL (`delete from auth.mfa_factors where user_id = …`) e cadastrado de novo no próximo acesso |

## 2. Riscos residuais

| Risco | Situação | Mitigação |
| --- | --- | --- |
| Privilégios padrão do papel `supabase_admin` ainda liberam novos objetos criados por ele | Não alterável pelo projeto | As migrações do projeto usam o papel `postgres` (corrigido). Toda migração nova deve conter `enable row level security` e GRANTs explícitos; rodar o Security Advisor após cada migração |
| CORS `*` nas Edge Functions (I1) | Aceito | Autenticação por cabeçalho Bearer; pode ser restrito ao domínio quando houver domínio próprio |
| Dicas de GRANT nas mensagens de erro do PostgREST (I2) | Aceito | Não expõe dados; só nomes de tabelas |
| Sessão em `localStorage` (I3) | Aceito (padrão Supabase) | CSP estrita sem scripts de terceiros; manter a CSP ao adicionar bibliotecas |
| CAPTCHA ausente (V04) | Pendente | Limites de e-mail do Auth (60/h) e de `capture_lead` reduzem o impacto |
| Prévias da Vercel | Não verificado (conector desconectado) | Confirmar em Vercel → Settings → Deployment Protection que "Vercel Authentication" está ativo para prévias |
| Verificação de senhas vazadas (I8) | Requer plano pago do Supabase | Ativar ao migrar de plano |
| Mercado Pago 429 mostrado como erro genérico | Melhoria | Tratar `429` do provedor como 503 "tente em instantes" em `mp-create-subscription` |

## 3. Checklist antes de cobranças reais

1. Autorização expressa do responsável.
2. Itens da seção 1 concluídos (credenciais rotacionadas, termos publicados).
3. Vercel Pro; domínio próprio com HTTPS; domínio verificado no Resend; `EMAIL_FROM` do domínio.
4. Remover `EMAIL_TEST_TO` e `MERCADO_PAGO_TEST_PAYER_EMAIL` dos Secrets.
5. Credenciais de **produção** do Mercado Pago + novo segredo de webhook (CONFIGURACAO §4.8).
6. Atualizar `SITE_URL`, Redirect URLs (`npm run auth:email` com `SITE_URLS` exatas — o script recusa curingas) e, se desejado, CORS restrito ao domínio.
7. Repetir a bateria de segurança (seção 5) e uma compra real de baixo valor.

## 4. Boas práticas para as próximas etapas

- **Toda tabela nova:** `enable row level security`, `revoke all … from anon, authenticated`, GRANTs mínimos por coluna, políticas com `(select auth.uid())`.
- **Funções SECURITY DEFINER:** `set search_path = ''`, nomes qualificados, `revoke all … from public` e EXECUTE só para quem precisa.
- **Edge Functions novas:** `verify_jwt = true` por padrão; validar o corpo; usar `rateLimited`; nunca devolver `error.message` interno ao cliente.
- **Conteúdo pago (PDFs, Etapa 2):** liberar arquivos por URL assinada de curta duração gerada no servidor somente para assinatura `active`; bucket privado; nunca URL pública permanente.
- **IA e fontes externas:** tratar texto de notícias como dado não confiável (sanitizar antes de renderizar; não executar instruções contidas no conteúdo); chaves de IA apenas em Secrets.
- **Links de e-mail:** manter `{{ .SiteURL }}` + `token_hash`; nunca reintroduzir curingas nas Redirect URLs.
- **Dependências:** `npm audit` mensal; atualizar na `develop` e testar antes do merge; manter versões fixas nas funções.
- **Monitoramento:** revisar logs das funções (`mp-webhook` com "assinatura inválida" em volume indica ataque), `payment_events` com `failed`, e o Security Advisor.

## 5. Como repetir a auditoria

Os cenários executados estão descritos em `SEGURANCA_CORRECOES.md` §3. Resumo do mínimo a repetir após mudanças relevantes:
1. Visitante e usuário comum tentando ler/alterar `profiles`, `subscriptions`, `payments`, `plans`, `admins`, `leads` (esperado: bloqueado).
2. Webhook sem assinatura (401, sem gravação) e com reenvio idêntico (`duplicate`).
3. `generate_link` de recuperação com `redirect_to` externo (deve voltar ao site oficial).
4. `/entrar?next=/\example.com` (deve permanecer no site).
5. Função `admin` sem MFA (403 `mfa_required`).
6. `npm audit`, `npm run test:functions`, `npm run build`, Security Advisor, cabeçalhos HTTP de produção.
