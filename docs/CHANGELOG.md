# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [Não publicado] — Etapa 2 · Subetapa 2.1: estrutura do banco e infraestrutura

### Adicionado
- Migração 12: 15 tabelas da Etapa 2 (fontes, notícias, assuntos, verificações, análises, revisões, edições, documentos, entregas, fila, consumo de IA, configurações), funções `claim_jobs`/`finish_job`, bucket privado `documents`, retenção ampliada. Script de reversão em `supabase/rollback/`.
- `worker/`: pacote Node/TypeScript separado (config validada, log sem segredos, retry com backoff, fila no Postgres, tarefa `healthcheck`) com 8 testes.
- Workflows `worker-ci` (testes) e `worker-run` (execução manual).

## [0.10.0] — 2026-11-05 — Termos de Uso e Política de Privacidade

### Adicionado
- Páginas `/termos` e `/privacidade` (versão 1.0), com índice, âncoras por seção e base legal: CDC (inclusive direito de arrependimento de 7 dias, art. 49), Decreto 7.962/2013, Marco Civil da Internet, LGPD e Resolução CD/ANPD 19/2024.
- Conteúdo editável em `src/content/legal.ts`; dados do fornecedor/encarregado lidos de `src/config/site.ts` (campos vazios aparecem destacados como "a preencher", nunca inventados).
- Migração 11: `access_logs` — registro de cada login (IP, data/hora, navegador) mantido por 6 meses (Marco Civil, art. 15), inclusive após exclusão da conta; sem acesso pelo site.

### Alterado
- FAQ "Posso cancelar a assinatura?" com as regras de cancelamento e arrependimento.

## [0.9.0] — 2026-11-05 — Auditoria de segurança

Relatórios: `docs/SEGURANCA_AUDITORIA.md`, `docs/SEGURANCA_CORRECOES.md`, `docs/SEGURANCA_RECOMENDACOES.md`.

### Segurança
- **Crítica (V01):** removido o curinga das Redirect URLs do Auth; links de e-mail fixos no site oficial com `token_hash` + `verifyOtp`; cliente em PKCE; script de Auth recusa curingas.
- Redirecionamento após login aceita só caminhos internos (V02).
- Webhook não grava chamadas com assinatura inválida, limita o payload e descarta reenvios idênticos (V03, V09).
- Limite de requisições nas funções e em `capture_lead` (V04 parcial, V05).
- Privilégios padrão do schema `public` fechados; funções utilitárias sem EXECUTE para o site; `user_preferences` com UPDATE só em campos de preferência (V06, V13).
- Painel administrativo exige MFA (TOTP) — servidor recusa sessão sem `aal2` (V07).
- Senha mínima 8 no servidor e reautenticação para troca de senha (V10); cadastro não revela e-mails existentes (V11); estorno/contestação cancela a assinatura (V12).

### Adicionado
- "Privacidade e dados" em `/conta`: baixar meus dados e excluir minha conta (Edge Function `account`).
- Migração 10: `rate_limits`, `rate_limit_hit`, `apply_retention` + tarefa diária `lgpd-retencao`, `payment_events.signature_ts`.
- Teste de estorno (22 testes Deno).

### Alterado
- `supabase-js` fixado em 2.119.0 nas funções; Vite 8.3.6.
- Texto do cadastro: link de confirmação expira em 1 hora.

## [0.8.0] — 2026-11-05 — Área administrativa

### Adicionado
- Painel `/admin` (somente administradores): visão geral com assinantes ativos, MRR, ticket médio, receita do mês/total, crescimento, conversão, churn, pagamentos recusados, leads e gráfico de receita dos últimos 6 meses.
- Abas Assinantes (busca, filtro por status, detalhe com pagamentos e e-mails, atualizar pelo Mercado Pago, cancelar assinatura), Pagamentos e Leads — todas com exportação CSV.
- Edge Function `admin` (confere o administrador no servidor) e módulo de indicadores testável (`admin/metrics.ts`, 3 testes; total 21).
- Migração 9: tabela `admins` (RLS: cada usuário lê só o próprio registro; inclusão apenas manual).
- Administradores entram direto no painel: o login leva a `/admin` e `/conta` redireciona para lá (administrador não é assinante). `/admin` com `noindex` e sem cache.

## [0.7.0] — 2026-11-05 — Etapa 1 · Subetapa 7: Testes, segurança e publicação

### Adicionado
- Publicação na Vercel: `https://atualidadeai-concursos.vercel.app` (deploy automático pela `main`; prévias pela `develop`).
- Repositório GitHub privado `egrinaldo/atualidadeai-concursos`; fluxo `develop → Pull Request → main`.
- Cabeçalhos de segurança (CSP, HSTS, X-Frame-Options, COOP, Permissions-Policy) e cache de assets no `vercel.json`.
- Trava no build contra chave secreta em variáveis `VITE_`.
- Migração 8: `pg_net` movido para o schema `extensions` (Security Advisor).
- Documentação: `docs/TESTES.md`, `docs/MANUTENCAO.md`, guia de deploy em CONFIGURACAO §6–§7.

### Alterado
- Supabase: secret `SITE_URL` e Site URL/Redirect URLs do Auth apontando para produção (prévias e localhost mantidos).

### Corrigido
- Landing estourava a largura em 320 px (seção de demonstração do PDF).
- Mensagem genérica quando o envio do e-mail de cadastro falha.

### Segurança
- Histórico do Git substituído por commit único: commits antigos continham o Access Token do Mercado Pago em `.env.example`.

## [0.6.0] — 2026-11-04 — Etapa 1 · Subetapa 6: E-mails e comunicações

### Adicionado
- Módulo de e-mail desacoplado (`supabase/functions/_shared/email/`): provedor Resend (e provedor `log`), 7 modelos em português (HTML + texto), envio idempotente.
- E-mails automáticos: confirmação de contratação, orientações iniciais, pagamento aprovado, pendente e recusado — disparados pelo webhook, pela sincronização e pela conciliação.
- Supabase Auth com SMTP do Resend e modelos próprios de confirmação de cadastro e recuperação de senha.
- Migração 7: tabela `email_log`.
- Scripts `npm run email:samples` e `npm run auth:email`; `npm run test:functions` agora com 18 testes.

### Corrigido (configuração do Supabase Auth)
- Site URL estava `http://localhost:3000` (padrão) e a lista de Redirect URLs vazia — ajustados para `http://localhost:5173` e `http://localhost:5173/**`.
- Limite de e-mails de autenticação: 2 → 60 por hora (com SMTP próprio).

### Testes
- 18/18 testes automáticos (modelos, escape de HTML, datas/valores BR, mapeamento de status, assinatura HMAC).
- 7 exemplos enviados com sucesso pelo Resend.
- Webhook assinado real → pagamento aprovado registrado → e-mail "Pagamento aprovado" enviado; notificação repetida **não** gerou segundo e-mail.

### Limitações
- Sem domínio próprio: envio apenas para o e-mail da conta Resend (`EMAIL_TEST_TO`). Liberação ao público: docs/CONFIGURACAO.md §5.4.
- Envio automático dos PDFs não implementado (fora do escopo desta etapa).

## [0.5.0] — 2026-11-04 — Etapa 1 · Subetapa 5: Assinatura com Mercado Pago (ambiente de teste)

### Adicionado
- Edge Functions: `mp-create-subscription`, `mp-webhook`, `mp-sync`, `mp-cancel-subscription`, `mp-reconcile`, `mp-return` (+ módulos `_shared`).
- Migração 5: colunas de controle em `subscriptions` e tabela de auditoria `payment_events`.
- Migração 6: conciliação agendada (`pg_cron` + `pg_net`, a cada 6 h; segredos no Vault).
- Site: contratação na área do assinante (com "E-mail da sua conta Mercado Pago"), continuar pagamento pendente, "Já paguei — atualizar status", cancelamento com confirmação, páginas de retorno (`/pagamento/retorno|sucesso|pendente|falha`) baseadas na API.
- 12 testes automáticos (Deno) de assinatura HMAC e regras de status/valor.

### Testes realizados (ambiente de teste do Mercado Pago, projeto Supabase real)
- Criação da assinatura → checkout → **pagamento de R$ 10,00 aprovado** (cartão de teste, conta compradora de teste) → ativação → pagamento registrado → cancelamento no Mercado Pago e no banco.
- Webhook: assinatura válida aceita (inclusive notificação enviada pelo próprio painel do Mercado Pago), falsas/alteradas recusadas (401), repetição idempotente, recurso inexistente ignorado sem reenvio.
- Segurança: funções exigem login; usuário só lê os próprios dados; segunda assinatura ativa bloqueada; valor/moeda conferidos; nenhuma assinatura órfã em caso de falha.
- Conciliação agendada executada pelo próprio banco (pg_cron → pg_net → função): 200.
- Dados de teste removidos; assinaturas pendentes de teste canceladas no Mercado Pago.

### Limitações conhecidas
- No ambiente de teste, o Mercado Pago não enviou webhooks para eventos reais (só a simulação do painel). Coberto pela sincronização e pela conciliação agendada; reavaliar em produção.
- `SITE_URL` em `http://localhost:5173`: o retorno do checkout passa pela função `mp-return` até o site ter https (Subetapa 7).
- Cobranças reais **não** ativadas (aguardam autorização).

## [0.4.0] — 2026-11-04 — Etapa 1 · Subetapa 4: Cadastro, login e leads

### Adicionado
- Páginas: `/cadastro`, `/entrar`, `/recuperar-senha`, `/redefinir-senha`, `/confirmar-email`, `/conta` (carregadas sob demanda).
- Cadastro com nome completo, e-mail, senha + confirmação (indicador de força), estado, cidade (lista oficial do IBGE por UF) e aceite de Termos/Privacidade; validação por campo, foco no primeiro erro, mensagens acessíveis.
- Integração Supabase Auth (`src/lib/auth.ts`): cadastro com confirmação por e-mail, detecção de e-mail já cadastrado, login, reenvio de confirmação, recuperação e redefinição de senha, logout; erros traduzidos.
- Captação de leads (`src/lib/leads.ts`) no envio do cadastro — exceto e-mail recusado ou já cadastrado.
- Área do assinante mínima (`/conta`): dados do perfil e situação da assinatura; conta nova **não** vira assinante.
- Plano escolhido na landing guardado para retomar a contratação (Subetapa 5).
- `public/data/municipios/*.json` (5.571 municípios, IBGE).
- Componentes `TextField`, `PasswordField`, `SelectField`, `Checkbox`, `Alert`, `AuthLayout`; hooks `useSession`, `useMunicipios`.

### Testes (navegador real contra o Supabase do projeto)
- 36/36: validações, municípios, duplicidade, login correto/incorreto, conta não confirmada, `/conta` protegida, logout, redirecionamento externo bloqueado, recuperação, links expirados, mobile.
- Confirmado no projeto real: limite de envio de e-mails (429) tratado com mensagem clara.
- Dados de teste removidos (banco: 0 usuários, 0 leads, 1 plano).

### Corrigido durante os testes
- Logout redirecionava para o login em vez da página inicial.
- Lead era gravado mesmo para e-mail recusado ou já cadastrado.

### Pendências
- Teste ponta a ponta com e-mail real (confirmação e recuperação) — depende do responsável (limite de 2 e-mails/hora e envio só para a equipe até a Subetapa 6).
- Conferir Site URL e Redirect URLs no painel (docs/CONFIGURACAO.md §3.6).

## [0.3.1] — 2026-11-04 — Banco aplicado no projeto Supabase real

### Realizado
- Migrações 1–4 aplicadas no projeto Supabase (PostgreSQL 17.11, região us-east-1) via Session pooler, cada uma em transação.
- `verificacao.sql`: 14/14 OK. `npm run check:supabase`: tudo certo.
- Teste de integração no banco real (transação desfeita ao final, nenhum dado restante): 28/28 — trigger de cadastro, isolamento entre usuários, bloqueios de visitante, idempotência de pagamento, exclusão de usuário.
- Teste pela API pública (chave do site): `capture_lead` grava; leitura de leads e escrita em plans bloqueadas; lead de teste removido.

### Corrigido
- `.env`: URL do Supabase sem `/rest/v1/`; `.env.example` restaurado como modelo em branco (estava com valores reais, não versionados).
- `check:supabase`: lê `.env` e `.env.local`; aceita URL com `/rest/v1/`; detecta `service_role`; mensagem única quando as tabelas não existem.
- Bloqueio de segurança do build também detecta chave legada `service_role`.

## [0.3.0] — 2026-11-04 — Etapa 1 · Subetapa 3: Banco de dados Supabase

### Adicionado
- 4 migrações SQL versionadas e reexecutáveis em `supabase/migrations/`:
  - tabelas `profiles`, `plans`, `subscriptions`, `payments`, `user_preferences`, `leads` com chaves estrangeiras, restrições e índices;
  - GRANTs explícitos (exigidos pelo Supabase desde 30/10/2026) e 8 políticas RLS;
  - trigger que cria perfil e preferências no cadastro; sincronização de e-mail; função `capture_lead`;
  - plano inicial `mensal` de R$ 10,00.
- `supabase/verificacao.sql` (checagem pós-instalação).
- `src/types/database.ts` com os tipos reais do banco; cliente Supabase tipado.
- `src/lib/supabaseHealth.ts` + cartão de conexão real na página `/status`.
- `npm run check:supabase` (`scripts/check-supabase.mjs`): testa conexão, plano ativo e bloqueios de acesso usando só a chave pública.
- Tutorial completo em `docs/CONFIGURACAO.md` §3; `docs/BANCO_DE_DADOS.md` reescrito.

### Decisões
- Colunas extras além do briefing, com justificativa: `plans.code`/`currency`/`updated_at` (identificador estável e moeda), `profiles.terms_accepted_at` (registro do aceite exigido na Subetapa 4), `payments.provider`/`currency`/`status_detail` e `updated_at` nas demais tabelas (auditoria).
- Pagamentos preservados (vínculos anulados) quando um usuário é excluído; assinaturas e dados pessoais são removidos.
- Leads só via função `capture_lead`: e-mail repetido não gera erro (não revela cadastros existentes) e não sobrescreve dados.
- Uma assinatura `active` por usuário; `external_payment_id` único para idempotência do webhook.

### Testes
- 72/72 verificações em PostgreSQL real (PGlite 0.5.15) com simulação do schema `auth` e dos papéis `anon`/`authenticated`/`service_role`; migrações executadas duas vezes seguidas sem erro.
- `check:supabase` validado contra servidor simulado (cenário correto e cenário com vazamento de leads) e cenários de erro (sem variáveis, chave secreta, URL inexistente).
- `typecheck` e `build`: OK.

### Pendências (dependem do responsável)
- Criar o projeto Supabase, executar os scripts e preencher o `.env.local` (tutorial em `docs/CONFIGURACAO.md` §3).

## [0.2.1] — 2026-11-04 — Ajuste comercial: plano único

### Alterado (decisão do responsável)
- Oferta passa a ser **um único plano: assinatura mensal de R$ 10,00** (antes: mensal, trimestral e anual com valores de exemplo).
- `src/content/plans.ts`: `plan` único, `PLAN_PRICES_ARE_EXAMPLES = false`, função `planPriceLabel()`.
- Seção de preços redesenhada para um card único (preço + "o que está incluso").
- Hero mostra "Assinatura de R$ 10,00/mês"; botão principal "Quero assinar".
- Menu: "Planos" → "Assinatura". CTA final: "Assinar agora".
- FAQ: nova pergunta "Quanto custa?" (valor lido do plano, sem repetir o número no texto).

### Impacto nas próximas subetapas
- Subetapa 3: a tabela `plans` continua existindo (preço configurável pelo banco), com um único registro ativo.
- Subetapa 5: implementar apenas a assinatura mensal recorrente; trimestral e anual deixam de ser necessários.

## [0.2.0] — 2026-11-04 — Etapa 1 · Subetapa 2: Identidade visual e landing page

### Adicionado
- Landing page completa (`src/pages/Home.tsx`) com 11 blocos: cabeçalho fixo com menu mobile, hero com ilustração do PDF, faixa de destaques do produto, problemas, benefícios, como funciona (4 passos), cobertura regional/nacional/internacional, materiais diário/semanal/mensal, demonstração ilustrativa dos PDFs, planos e preços, FAQ em acordeão, CTA final e rodapé institucional.
- Textos centralizados em `src/content/landing.ts`; planos em `src/content/plans.ts` (preços em centavos, cálculo de equivalente mensal e economia).
- Componentes: `Icon` (ícones SVG próprios), `Reveal` (animação discreta ao rolar, respeita "reduzir movimento"), `SectionHeading`, `PdfMock`, variante `light` do `Button`.
- Páginas provisórias (`ComingSoon`) para `/cadastro`, `/entrar`, `/termos`, `/privacidade` e endereços inexistentes.
- Link "Pular para o conteúdo" (acessibilidade).

### Alterado
- `App.tsx`: seleção de página pelo caminho; página técnica `/status` só em desenvolvimento e carregada sob demanda.
- JS inicial reduzido de 126,7 kB para 80,9 kB (gzip) — Supabase fora do pacote inicial.

### Conteúdo demonstrativo (identificado na página)
- Ilustrações de PDF marcadas "EXEMPLO", com temas fictícios genéricos.
- Preços marcados "Valores de exemplo" (R$ 29,90 / R$ 79,90 / R$ 238,80).
- Nenhum depoimento, número de clientes ou resultado. Os destaques do hero (3 níveis, 3 formatos, 27 UFs) descrevem o produto, não métricas.

### Testes
- `typecheck` e `build`: OK.
- Larguras 320, 390, 768, 1024 e 1440 px: sem rolagem horizontal, sem erros no console.
- Menu mobile abre/fecha e leva à seção correta; todas as âncoras têm destino; FAQ abre/fecha; rotas provisórias e 404 exibidas corretamente; 1 `h1` por página.

### Pendências
- Termos de Uso e Política de Privacidade (dependem do responsável). Preço definido em 0.2.1.
- Dados institucionais (razão social, CNPJ, e-mail) em `src/config/site.ts`.

## [0.1.0] — 2026-11-04 — Etapa 1 · Subetapa 1: Análise e estruturação

### Contexto
- A pasta continha um repositório Git com uma tentativa anterior (6 commits), mas os arquivos haviam sido removidos do diretório de trabalho. **Decisão do responsável:** recomeçar do zero; o histórico antigo permanece no Git apenas como registro.

### Adicionado
- Projeto React 19.3 + Vite 8 + TypeScript 7 (modo `strict`), seguindo as versões do modelo oficial `create-vite`.
- Tailwind CSS v4 via `@tailwindcss/vite` (sem PostCSS, sem ESLint).
- Design tokens (cores azul-marinho/azul/sinal, fontes Sora e Manrope, sombras, animações) em `src/index.css`, derivados das referências visuais.
- Componentes base: `Button`, `Badge`, `Container`, `Logo`.
- Leitura centralizada de variáveis (`src/config/env.ts`) com bloqueio de chave secreta no frontend.
- Cliente Supabase opcional (`src/lib/supabase.ts`) e tipos provisórios do banco.
- Página técnica temporária de verificação do ambiente (`src/pages/SetupStatus.tsx`).
- `vercel.json` (build, SPA rewrite, cabeçalhos de segurança, cache).
- `.env.example`, `.gitignore`, `.gitattributes`, `.nvmrc`.
- Pastas `supabase/migrations` e `supabase/functions`.
- Documentação: README e `docs/`.
- Imagens de referência movidas para `docs/design/referencias/`.

- Bloqueio, no build, de chaves secretas do Supabase em variáveis `VITE_`.
- `package-lock.json` gerado (inclui binários para Windows, Linux e macOS).

### Testes (2026-11-04)
- `npm install`: OK (51 pacotes).
- `npm run typecheck` (TypeScript 7.0.2): OK, sem erros.
- `npm run build` (Vite 8.3.5): OK — JS 443,6 kB (126,7 kB gzip), CSS 21,4 kB (4,8 kB gzip).
- `npm run dev` e `npm run preview`: OK (HTTP 200).
- Navegador (Chromium): 1440px, 820px e 320px renderizam sem erros e sem rolagem horizontal.
- Com variáveis Supabase de teste: cliente criado, status "OK".
- Com chave `sb_secret_` (por variável de sistema e por `.env.local`): build bloqueado com mensagem clara.
- `.env.local`, `dist/` e `node_modules/` ignorados pelo Git: OK.

### Pendências
- Executar `npm install` no Windows (o `node_modules` dos testes foi removido por conter binários Linux).
- Commit da Subetapa 1 no Git (aguardando o responsável).
- Avaliar na Subetapa 2 o carregamento sob demanda do Supabase para reduzir o JavaScript inicial.
