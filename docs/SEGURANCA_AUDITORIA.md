# Auditoria de segurança — AtualidadeAI Concursos

| | |
| --- | --- |
| Data | 05/11/2026 |
| Escopo | Código do repositório (frontend, Edge Functions, migrações, scripts), projeto Supabase, integração Mercado Pago (sandbox), site publicado na Vercel, histórico Git |
| Versão auditada | `0d3785e` (v0.8.0) |
| Versão corrigida | branch `seguranca/auditoria` (v0.9.0) |
| Referências | OWASP Top 10 (2021), OWASP ASVS 4.0 (níveis 1–2), documentação Supabase e Mercado Pago |
| Avaliação final | **APROVADO COM RESSALVAS** (ver §9) |

> Não há credenciais neste documento. Credenciais são citadas apenas pelo tipo e local.

## 1. Resumo executivo

A aplicação tinha uma base sólida: RLS em todas as tabelas, permissões explícitas (GRANTs), nenhuma chave secreta no frontend, Git ou bundle, e um fluxo de pagamento que confirma tudo na API do Mercado Pago. A auditoria encontrou **1 vulnerabilidade crítica** (sequestro de contas pelo endereço curinga do login), **7 médias**, **6 baixas** e **9 informativas**.

Todas as críticas e médias foram corrigidas ou mitigadas e **validadas com testes** (ver `SEGURANCA_CORRECOES.md`). Permanecem pendências que dependem do responsável pelo projeto (CAPTCHA, rotação de credenciais, textos jurídicos) e riscos residuais documentados (ver `SEGURANCA_RECOMENDACOES.md`).

## 2. Arquitetura analisada

| Componente | O que foi avaliado |
| --- | --- |
| Frontend (React 19, Vite 8, TypeScript, Tailwind 4) | Rotas, autenticação, redirecionamentos, armazenamento de sessão, XSS, mensagens de erro, variáveis `VITE_` |
| Supabase Auth | Cadastro, login, confirmação, recuperação, sessão, enumeração, política de senha, Redirect URLs, MFA, CAPTCHA |
| Postgres (9 tabelas na auditoria; 10 após correções) | RLS e políticas, GRANTs por coluna, privilégios padrão, funções SECURITY DEFINER e `search_path`, extensões, pg_cron/Vault |
| Edge Functions (7 na auditoria; 8 após correções) | Autenticação, autorização, validação de entrada, CORS, limites, tratamento de erros, uso da chave de serviço |
| Mercado Pago | Credenciais, criação de assinatura, valor, vínculo usuário–assinatura, webhook (HMAC), idempotência, reenvio, estornos |
| Vercel | Cabeçalhos HTTP, CSP, HSTS, arquivos expostos, sourcemaps, cache, rotas |
| Git/GitHub | Segredos no repositório e no histórico, `.gitignore` |
| LGPD | Coleta, finalidade, direitos do titular, retenção, acesso administrativo |

## 3. Metodologia

1. Reconhecimento: estrutura, configurações, dependências, migrações, catálogo do banco (`pg_class`, `pg_policies`, `pg_default_acl`, `pg_proc`), configuração do Auth via API de gerenciamento.
2. Testes ativos **não destrutivos** no único ambiente existente (projeto Supabase de teste/produção, Mercado Pago sandbox), sempre com contas e registros temporários removidos ao final. Nenhuma cobrança real, nenhum ataque a terceiros.
3. Ferramentas: `npm audit`, varredura de segredos por padrões e por valores do `.env` (árvore e histórico Git), Supabase Security Advisor, testes Deno, Playwright (navegador) com a CSP de produção.

## 4. Classificação dos achados

Legenda de tipo: **Confirmada** (explorada/demonstrada em teste) · **Configuração** (configuração inadequada verificada) · **Preventiva** (melhoria).

### 🔴 CRÍTICA

**V01 — Endereço curinga no login permitia sequestro de contas** — *Confirmada*
- Componente: Supabase Auth → Redirect URLs (`https://atualidadeai-concursos-*.vercel.app/**`) + `flowType: 'implicit'` (`src/lib/supabase.ts`); modelos de e-mail com `{{ .ConfirmationURL }}`.
- Exploração: o atacante cria um projeto Vercel `atualidadeai-concursos-<qualquer>` (gratuito), pede pela API pública a recuperação de senha da vítima com `redirect_to` para esse domínio; a vítima recebe e-mail legítimo; ao clicar, `access_token` e `refresh_token` vão na URL para o site do atacante.
- Impacto: tomada de qualquer conta, inclusive administrador (acesso a dados pessoais de todos, cancelamento de assinaturas).
- Evidência: link de recuperação gerado com `redirect_to=https://atualidadeai-concursos-atacante.vercel.app/roubar` redirecionou para esse domínio com `access_token` na URL; domínio fora do padrão foi recusado (controle).
- Correção: curinga removido; links fixos em `{{ .SiteURL }}` com `token_hash` + `verifyOtp`; fluxo PKCE; script recusa curingas.

### 🟠 ALTA
Nenhuma identificada.

### 🟡 MÉDIA

| ID | Achado | Tipo | Local | Evidência |
| --- | --- | --- | --- | --- |
| V02 | Redirecionamento aberto após login: `safeNext` aceitava `/\host` (navegadores tratam como `//host`) | Confirmada | `src/pages/auth/Entrar.tsx` | Login com `next=/\example.com/ataque` terminou em `https://example.com/ataque` |
| V03 | Webhook gravava em `payment_events` o corpo de chamadas **não autenticadas** (inundação do banco) | Confirmada | `supabase/functions/mp-webhook/index.ts` | Chamada sem assinatura gerou linha com 2.054 bytes |
| V04 | Sem CAPTCHA no cadastro/recuperação (cota de 60 e-mails/h do projeto pode ser esgotada) e `capture_lead` sem limite para visitantes | Configuração | Supabase Auth; `capture_lead` | `security_captcha_enabled=false`; função sem limite |
| V05 | Edge Functions sem limite de requisições (consomem a cota da API do Mercado Pago) | Configuração | `mp-sync`, `mp-create-subscription`, `mp-cancel-subscription`, `admin` | Revisão de código; 429 do Mercado Pago já observado |
| V06 | Privilégios padrão do schema `public` concediam tudo a `anon`/`authenticated` em novos objetos | Configuração | Banco (`pg_default_acl`) | ACL `anon=arwdDxtm` para tabelas, `anon=X` para funções |
| V07 | Painel administrativo protegido só por senha (sem MFA); senha inicial transmitida pelo chat | Configuração | `supabase/functions/admin/index.ts` | Nenhuma verificação de `aal` |
| V08 | LGPD: aceite de Termos/Política inexistentes; sem exportação/exclusão de conta; sem retenção definida | Confirmada (técnica) | `/termos`, `/privacidade`, banco | Páginas provisórias; ausência de funcionalidades |

### 🔵 BAIXA

| ID | Achado | Tipo | Evidência |
| --- | --- | --- | --- |
| V09 | Webhook aceitava reenvio de notificação assinada antiga (sem janela/deduplicação). Impacto limitado: processamento idempotente e sempre via API | Confirmada | Assinatura com `ts` de 2020 aceita (200) |
| V10 | Senha mínima 6 no servidor (site exige 8); troca de senha sem reautenticação | Configuração | `password_min_length=6` |
| V11 | Enumeração de usuários no cadastro ("Este e-mail já está cadastrado") | Confirmada | API devolve `identities: []`; o site exibia a mensagem |
| V12 | Estorno/contestação não alterava a assinatura | Confirmada (código) | `_shared/sync.ts` |
| V13 | `user_preferences`: UPDATE liberado em `id`, `user_id`, `created_at` (RLS impedia troca de dono) | Configuração | Privilégios de coluna |
| V14 | `.env` local com token pessoal do Supabase, URL do banco e senha do comprador de teste; token do Mercado Pago presente em commits antigos (histórico reescrito antes do 1º push) | Configuração | Nomes das variáveis; histórico atual sem segredos |

### ⚪ INFORMATIVA

| ID | Observação |
| --- | --- |
| I1 | CORS `*` nas Edge Functions (risco baixo: autenticação por cabeçalho Bearer, sem cookies) |
| I2 | Mensagens do PostgREST revelam nomes de tabelas e dicas de GRANT |
| I3 | Sessão em `localStorage` (padrão Supabase); mitigado pela CSP estrita; nenhum XSS encontrado (sem `dangerouslySetInnerHTML`, `innerHTML`, `eval`) |
| I4 | `supabase-js` sem versão fixa nas funções (`@2`); atualização menor do Vite disponível |
| I5 | Ativação não conferiria o valor se o plano não viesse na consulta (impedido pela FK) |
| I6 | `EMAIL_TEST_TO` e `MERCADO_PAGO_TEST_PAYER_EMAIL` devem sair na produção |
| I7 | Vercel Hobby não permite uso comercial |
| I8 | Proteção contra senhas vazadas (HIBP) indisponível no plano gratuito do Supabase |
| I9 | SPA responde 200 para qualquer caminho (sem exposição: `/.env`, `/.git/*` devolvem `index.html`; sem sourcemaps) |

## 5. Controles verificados como adequados (antes das correções)

- RLS: 24 tentativas de leitura/fraude bloqueadas (visitante e usuário comum; dados de terceiros; ativar assinatura; inserir pagamento aprovado; alterar preço; virar administrador; alterar e-mail/aceite).
- Edge Functions: autenticação e autorização corretas; usuário só opera a própria assinatura; `mp-return` sem redirecionamento aberto; conciliação protegida por segredo com comparação em tempo constante.
- Pagamentos: valor sempre do banco; ativação só via API com conferência de valor/moeda; idempotência por `external_payment_id`; webhook com HMAC.
- Segredos: nenhum no repositório, histórico ou bundle; `.env` ignorado.
- HTTP: CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP; sem sourcemaps; `npm audit` sem vulnerabilidades.

## 6. Referências

Plano de correção executado e evidências: `docs/SEGURANCA_CORRECOES.md`. Pendências, riscos residuais e recomendações: `docs/SEGURANCA_RECOMENDACOES.md`.
