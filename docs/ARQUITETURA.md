# Arquitetura

## Visão geral

```
 Navegador ──► Vercel (SPA React estática)
                 │  usa somente chaves PÚBLICAS
                 ▼
            Supabase ─── Auth (cadastro/login)
                 │   ─── PostgreSQL + RLS (perfis, planos, assinaturas, pagamentos, leads)
                 │   ─── Edge Functions (checkout, webhook) ◄── segredos ficam aqui
                 ▼
            Mercado Pago (checkout, assinaturas, notificações)
```

## Responsabilidades

| Serviço | Responsabilidade |
| --- | --- |
| **Vercel** | Hospeda o frontend estático (`dist/`), deploy automático a partir do GitHub, variáveis públicas do frontend, domínio e HTTPS. |
| **Supabase** | Banco PostgreSQL, autenticação, políticas RLS, Edge Functions para operações sensíveis (criar checkout, receber webhooks, atualizar assinaturas). |
| **Mercado Pago** | Checkout, cobranças recorrentes, notificações de pagamento. |

## Decisões arquiteturais

| # | Decisão | Justificativa |
| --- | --- | --- |
| D1 | **SPA estática** (sem servidor Node próprio) | O frontend não precisa de servidor; operações sensíveis vão para Edge Functions. Simplifica o deploy na Vercel (plano gratuito). |
| D2 | **Tailwind v4 via `@tailwindcss/vite`** | Integração oficial do Tailwind 4 com Vite, **sem PostCSS**, atendendo à diretriz do projeto. |
| D3 | **Sem ESLint** | Diretriz do projeto. A verificação estática fica a cargo do TypeScript em modo `strict` (`npm run typecheck`). |
| D4 | **Alias `@/` → `src/`** | Imports estáveis e legíveis (`@/components/ui`). Configurado em `vite.config.ts` e `tsconfig.app.json`. |
| D5 | **Cliente Supabase opcional** (`null` sem variáveis) | O projeto roda antes da Subetapa 3 sem erros; `getSupabase()` dá mensagem clara quando a configuração falta. |
| D6 | **Webhooks do Mercado Pago em Supabase Edge Functions** | Mantém segredos fora da Vercel/frontend e próximos do banco. |
| D7 | **Roteamento mínimo próprio** (`switch` no `App.tsx`) | Poucas páginas, todas provisórias além da landing. Quando cadastro, login e retorno de pagamento forem implementados, será proposto o `react-router` para aprovação. |
| D11 | **Textos em `src/content/`** | Separar conteúdo de layout: alterar um texto não exige mexer em componentes. Prepara a troca dos planos fixos pelos dados da tabela `plans` (Subetapa 5). |
| D12 | **Ícones próprios em SVG** (`Icon.tsx`) e **acordeão nativo** (`<details>`) | Nenhuma dependência nova; acessível por teclado. |
| D13 | **Carregamento sob demanda** da página técnica | O código do Supabase não entra no pacote inicial da landing (JS inicial: 81 kB gzip). |
| D9 | **Bloqueio de chave secreta no build** (`vite.config.ts`) | Se qualquer variável `VITE_` contiver uma chave `sb_secret_`, o `dev`/`build` é interrompido antes de gerar arquivos — a chave nunca chega ao JavaScript público. |
| D10 | **Versões do modelo oficial do Vite** (Vite 8, plugin React 6, TypeScript 7) | Combinação testada pelo próprio Vite; evita incompatibilidades. |
| D14 | **Segurança do banco em duas camadas** (GRANT + RLS) | GRANTs explícitos (exigência do Supabase desde 30/10/2026) limitam tabelas/colunas; RLS limita linhas. Assinaturas e pagamentos só são gravados pelo backend. |
| D15 | **Perfil criado por trigger** em `auth.users` | Garante perfil para todo usuário, mesmo se o navegador fechar após o cadastro; o navegador não precisa de permissão de INSERT em `profiles`. |
| D16 | **Leads via função `capture_lead`** | Sem leitura/escrita direta pela API; não revela e-mails já cadastrados. |
| D17 | **Migrações reexecutáveis** | Facilitam a execução manual pelo SQL Editor sem risco de erro ao repetir. |
| D18 | **Fluxo de autenticação `implicit`** | O link de confirmação/recuperação funciona mesmo se aberto em outro navegador ou no celular (o fluxo PKCE exigiria o mesmo navegador). |
| D19 | **Municípios do IBGE servidos pelo próprio site** (`public/data/municipios/{UF}.json`, 152 kB no total, baixado só a UF escolhida) | Lista oficial sem depender de API externa no momento do cadastro. |
| D20 | **Páginas de conta em pacote separado** (`auth-*.js` + `supabase-*.js`) | A landing não baixa o código do Supabase (JS inicial mantido em ~82 kB gzip). |
| D21 | **Sem `react-router`** | O roteamento mínimo atende às páginas da Etapa 1 sem nova dependência. |
| D22 | **Assinatura do Mercado Pago sem plano associado** (`POST /preapproval`, status `pending`) | Cada assinatura recebe `external_reference` = ID local, ligando o pagamento ao usuário sem ambiguidade; o preço vem da tabela `plans`. |
| D23 | **Ativação só por dados da API** (webhook validado ou sincronização) | A URL de retorno do checkout pode ser forjada; a API do Mercado Pago não. |
| D24 | **Conciliação agendada (pg_cron, 6 h)** além do webhook | Webhooks podem atrasar ou não chegar (observado no ambiente de teste). A conciliação garante renovações e cancelamentos refletidos. |
| D25 | **Auditoria em `payment_events`** | Diagnóstico de qualquer notificação (assinatura válida, resultado, erro). |
| D26 | **E-mail da conta Mercado Pago informado antes do pagamento** | O Mercado Pago só aceita o pagamento pela conta do e-mail da assinatura. |
| D27 | **Resend** como provedor de e-mail, isolado em `_shared/email/provider.ts` | Integração desacoplada: trocar de provedor altera um arquivo. |
| D28 | **Login via SMTP do Supabase + transacionais via API** | O Supabase Auth gera os links seguros de confirmação/recuperação; os e-mails de pagamento dependem de eventos do backend. |
| D29 | **E-mails idempotentes (`email_log.dedupe_key`)** | Webhooks e sincronizações podem repetir o mesmo evento; cada evento gera no máximo um e-mail. |
| D30 | **Redirecionamento de teste (`EMAIL_TEST_TO`)** | Permite testar todos os fluxos sem domínio, sem risco de enviar a terceiros. |
| D31 | **Branches `develop` → `main`** | Toda alteração passa por uma prévia da Vercel antes de chegar à produção. |
| D32 | **Cabeçalhos de segurança no `vercel.json`** | CSP restrita a Supabase e Google Fonts; impede embutir o site em iframes e scripts de terceiros. |
| D35 | **Links de e-mail com `token_hash` fixos no `{{ .SiteURL }}` + PKCE** | Nenhum token de sessão na URL e o destino não depende do pedido; funciona em outro dispositivo (auditoria V01). |
| D36 | **MFA obrigatório para administradores (aal2 no servidor)** | O painel expõe dados de todos os usuários; senha sozinha não basta (V07). |
| D37 | **Limite de requisições no próprio Postgres** (`rate_limit_hit`) | Sem serviço externo novo; protege a cota do Mercado Pago e evita abuso (V05). |
| D38 | **Exclusão de conta mantém pagamentos anonimizados** | Atende ao direito de eliminação (LGPD) preservando registros financeiros de guarda obrigatória (V08). |
| D34 | **Painel admin via Edge Function** | O navegador nunca recebe permissão para ler dados de outros usuários; a função confere `public.admins` com a chave de serviço. Esconder a tela é só conveniência. |
| D33 | **Vercel Hobby na fase de teste, Pro antes de vender** | Hobby proíbe uso comercial; migrar é obrigatório antes de cobranças reais. |
| D8 | **Design tokens centralizados** em `src/index.css` (`@theme`) | Trocar cores/fontes em um único lugar. |

## Preparação para etapas futuras

As pastas `supabase/functions/` e `supabase/migrations/` já existem para receber, em etapas posteriores, funções de monitoramento de notícias, geração de PDFs e envios programados — sem impacto no frontend atual.

## Etapa 2 — motor de notícias (Subetapa 2.1)

```
GitHub Actions (worker agendado) ──► Supabase Postgres (fila processing_jobs + dados)
        │  coleta · triagem · verificação · análise · edição · PDF · entrega
        ├──► NVIDIA NIM (camada de IA independente do provedor)
        └──► Supabase Storage (bucket privado "documents")
Painel /admin ◄──► Edge Functions (service_role) ◄──► Postgres/Storage
Assinante /conta ──► link temporário do PDF individual (nome/e-mail no rodapé)
```

| # | Decisão | Motivo |
| --- | --- | --- |
| D39 | **Worker em GitHub Actions** (pasta `worker/`, pacote separado) | Edge Functions têm 2 s de CPU por requisição — insuficiente para lotes e PDF; Actions roda Node + Playwright, gratuito dentro da cota, sem servidor para manter |
| D40 | **Fila no Postgres** (`processing_jobs` + `claim_jobs`/`finish_job` com `FOR UPDATE SKIP LOCKED`) | Retomada após falhas, idempotência (`dedupe_key`), backoff exponencial no banco; sem serviço de fila externo |
| D41 | **PDF por estado + personalização por assinante** | Conteúdo depende só da UF (sem municípios). Base gerada uma vez por estado; capa/rodapé com nome e e-mail aplicados por assinante (`pdf-lib`) |
| D42 | **Ordem do PDF: Estado → Nacional → Internacional** | O diferencial do produto vem primeiro |
| D43 | **Piloto: Ceará; publicação às 06h; fechamento às 22h** (fuso de Brasília) | Separação clara entre estadual e nacional; folga de 1h30 para atrasos do agendador e da IA |
| D44 | **Texto original das notícias apagado após 30 dias** | Direitos autorais: o produto guarda título, link e resumo próprio |
| D45 | **Coleta só por RSS/Atom/API oficial; sem raspagem de HTML** | Respeita termos e direitos autorais; menos frágil |
| D46 | **Fontes comerciais desligadas até haver licença** | Produto pago: reprodução comercial exige autorização |
| D47 | **Fetcher com lista de hosts por fonte e bloqueio de IP interno** | Evita SSRF quando fontes passarem a ser cadastradas pelo painel |
| D48 | **Coleta a cada 3h com chave por janela** | Atualidade suficiente para edição diária; reexecução não duplica |
