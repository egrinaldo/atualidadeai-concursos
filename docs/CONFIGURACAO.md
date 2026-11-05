# Configuração

## 1. Ambiente local

1. Instale o **Node.js 22 LTS** em <https://nodejs.org> (botão "LTS"). Feche e reabra o terminal.
2. Confirme: `node -v` (≥ 20.19) e `npm -v`.
3. Na pasta do projeto:
   ```bash
   npm install
   ```
4. Crie o arquivo local de variáveis:
   - PowerShell: `Copy-Item .env.example .env.local`
   - macOS/Linux: `cp .env.example .env.local`
5. Rode `npm run dev` e abra <http://localhost:5173>.

## 2. Variáveis de ambiente

| Variável | Pública? | Onde fica | Subetapa |
| --- | --- | --- | --- |
| `VITE_SITE_URL` | Sim | `.env.local` / Vercel | 1 |
| `VITE_SUPABASE_URL` | Sim | `.env.local` / Vercel | 3 |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Sim | `.env.local` / Vercel | 3 |
| `VITE_MERCADO_PAGO_PUBLIC_KEY` | Sim | `.env.local` / Vercel | 5 |
| Secret key do Supabase (`sb_secret_...`) | **Não** | Secrets das Edge Functions | 5 |
| `MERCADO_PAGO_ACCESS_TOKEN` | **Não** | Secrets das Edge Functions | 5 |
| `MERCADO_PAGO_WEBHOOK_SECRET` | **Não** | Secrets das Edge Functions | 5 |

**Regra:** tudo que começa com `VITE_` é visível no navegador. Segredos jamais recebem esse prefixo.
Por segurança, o `vite.config.ts` **interrompe o `npm run dev` e o `npm run build`** se alguma variável `VITE_` contiver uma chave secreta do Supabase (`sb_secret_...`). O `src/config/env.ts` repete a verificação no navegador como segunda barreira.

Após alterar `.env.local`, **reinicie** o `npm run dev` para que os novos valores sejam lidos.

## 3. Supabase (Subetapa 3)

> Tempo estimado: 15 minutos. Nenhuma credencial deve ser enviada no chat.

### 3.1 Criar a conta e o projeto
1. Acesse <https://supabase.com> e clique em **Start your project**. Entre com sua conta do GitHub ou e-mail.
2. Se for o primeiro acesso, crie uma **Organization** (ex.: `AtualidadeAI`), plano **Free**.
3. Clique em **New project** e preencha:
   - **Project name:** `atualidadeai-concursos`
   - **Database Password:** clique em **Generate a password** e **guarde-a em um gerenciador de senhas**. Ela não é usada pelo site, mas é necessária para acesso administrativo ao banco.
   - **Region:** **South America (São Paulo)** — menor latência para usuários no Brasil.
4. Clique em **Create new project** e aguarde 1–2 minutos até o painel ficar disponível.

> Plano gratuito: projetos sem uso por um período podem ser **pausados** automaticamente; basta reativá-los no painel. Consulte os limites atuais em <https://supabase.com/pricing>.

### 3.2 Localizar a Project URL e a chave pública
1. No painel do projeto, clique no botão **Connect** (topo da página) — ele mostra a **Project URL** e a **Publishable key**. Alternativamente: menu lateral **Project Settings → API Keys**.
2. **Project URL:** formato `https://xxxxxxxx.supabase.co`.
3. **Publishable key:** começa com `sb_publishable_...`. É a chave **pública**, própria para o navegador.
   - Se o projeto mostrar apenas as chaves antigas, a `anon` (aba *Legacy*) também funciona, mas prefira criar a Publishable key em **API Keys** — as chaves antigas serão descontinuadas até o fim de 2026.
4. ⚠️ **NÃO** copie a **Secret key** (`sb_secret_...`) nem a `service_role` para o `.env.local`. Elas dão acesso total ao banco e só serão usadas nas Edge Functions (Subetapa 5).

### 3.3 Executar os scripts SQL
1. Menu lateral → **SQL Editor** → **New query**.
2. No VS Code (ou Bloco de Notas), abra o primeiro arquivo de `supabase/migrations/`, copie **todo** o conteúdo e cole no editor.
3. Clique em **Run** (ou **Ctrl+Enter**). Deve aparecer *"Success. No rows returned"*.
4. Repita, **na ordem**, para os quatro arquivos:
   1. `20261104120000_schema_inicial.sql`
   2. `20261104120100_rls_e_permissoes.sql`
   3. `20261104120200_funcoes_cadastro_e_leads.sql`
   4. `20261104120300_dados_iniciais_planos.sql`
   - Se o editor perguntar sobre *"destructive operations"* ou RLS, confirme: os scripts usam `drop ... if exists` apenas para poder ser reexecutados.
5. Por fim, cole e execute `supabase/verificacao.sql`. **Todas as linhas devem mostrar `OK`.**
6. Opcional: menu **Table Editor** → as 6 tabelas aparecem com o selo de RLS ativo; a tabela `plans` tem 1 linha (R$ 10,00).

Se algum script falhar, copie a mensagem de erro (sem credenciais) e me envie. Como os scripts são reexecutáveis, basta corrigir e rodar novamente.

> **Alternativa ao SQL Editor:** os scripts também podem ser aplicados por conexão direta ao banco. Use a connection string do tipo **Session pooler** (a "Direct connection" só funciona em redes IPv6 no plano gratuito), em uma variável **sem** prefixo `VITE_` no `.env` (ex.: `SUPABASE_DB_URL`), e remova-a após o uso.

### 3.4 Configurar as variáveis de ambiente
1. Abra o arquivo `.env.local` (ou `.env`) na raiz do projeto — crie a partir do `.env.example` se não existir. **Não** preencha o próprio `.env.example`: ele vai para o GitHub.
2. Preencha:
   ```
   VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxx
   ```
3. Salve. O `.env.local` está no `.gitignore` e **não** vai para o GitHub.

### 3.5 Verificar a conexão
1. No terminal, na pasta do projeto:
   ```bash
   npm run check:supabase
   ```
   Resultado esperado: todas as linhas com ✓ e a mensagem **"Tudo certo! Banco configurado corretamente."** O comando também confirma que visitantes **não** conseguem ler perfis, assinaturas, pagamentos e leads.
2. Visualmente: rode `npm run dev` e abra <http://localhost:5173/status>. O cartão **"Banco de dados Supabase (conexão real)"** deve mostrar **OK** e o plano "Assinatura mensal (R$ 10,00)".

| Mensagem | Solução |
| --- | --- |
| Variáveis ausentes | Preencha o `.env.local` (passo 3.4) |
| A chave informada é SECRETA | Troque pela Publishable key |
| Não foi possível conectar | Confira a Project URL e a internet |
| Tabela não existe / could not find | Execute os scripts SQL (passo 3.3) |
| Invalid API key | Copie a Publishable key novamente |
| Visitante conseguiu ler… | Execute de novo `20261104120100_rls_e_permissoes.sql` |

### 3.6 Preparação da autenticação (usada na Subetapa 4)
Menu **Authentication**:
1. **Sign In / Providers → Email:** mantenha **habilitado** e com **Confirm email** ativado.
2. **URL Configuration:**
   - **Site URL:** `http://localhost:5173` (será trocada pelo domínio de produção na Subetapa 7).
   - **Redirect URLs:** adicione `http://localhost:5173/**` (cobre `/confirmar-email` e `/redefinir-senha`). Em produção, adicione também `https://SEU-DOMINIO/**`.
3. **Limites do envio padrão de e-mails do Supabase** (válidos até configurarmos SMTP próprio na Subetapa 6):
   - só entrega para e-mails de **membros da equipe** do projeto (Organization → Team); outros endereços recebem o erro "e-mail não autorizado";
   - no máximo **2 e-mails por hora** (cadastro, reenvio e recuperação somam).
   Para testar agora, cadastre-se com o e-mail da sua conta Supabase.

## 4. Mercado Pago (Subetapa 5)

> Toda a integração foi feita e testada no **ambiente de teste**. Nenhuma cobrança real é possível com credenciais de teste. A migração para produção (§4.8) só deve ser feita com autorização expressa.

### 4.1 Conta e aplicação
1. Entre em <https://www.mercadopago.com.br/developers/panel/app> com sua conta Mercado Pago (crie uma em mercadopago.com.br se necessário).
2. **Criar aplicação** → nome `AtualidadeAI Concursos` → tipo **Pagamentos online** → produto **Assinaturas** (se oferecido) → aceite os termos.

### 4.2 Credenciais de teste
1. Na aplicação: **Credenciais → Teste** (ou "Credenciais de teste").
2. Copie o **Access Token** (é secreto) e a **Public Key** (pública).
3. As credenciais de teste pertencem a uma **conta vendedora de teste** criada automaticamente; no modelo atual elas também começam com `APP_USR-`. A consulta `GET https://api.mercadopago.com/users/me` com esse token mostra `test_user` nas tags.

### 4.3 Conta compradora de teste
- Vendedor de teste só aceita **comprador de teste**. Crie em **Contas de teste → Criar conta de teste** (Brasil, tipo Comprador) ou via API `POST /users/test_user` (foi o que usamos; as credenciais ficaram no `.env`).
- Guarde usuário, senha e e-mail. Em logins que pedem código, use o código exibido no painel ou os 6 últimos dígitos do ID da conta.

### 4.4 Onde ficam as credenciais

| Valor | Onde | Visível no navegador? |
| --- | --- | --- |
| Public Key | `.env` → `VITE_MERCADO_PAGO_PUBLIC_KEY` (e Vercel) | Sim (pública) |
| Access Token | **Secrets das Edge Functions** → `MERCADO_PAGO_ACCESS_TOKEN` | **Não** |
| Assinatura secreta do webhook | Secrets → `MERCADO_PAGO_WEBHOOK_SECRET` | **Não** |
| E-mail do comprador de teste (só em teste) | Secrets → `MERCADO_PAGO_TEST_PAYER_EMAIL` | **Não** |
| Endereço do site | Secrets → `SITE_URL` (ex.: `http://localhost:5173`; em produção `https://seu-dominio`) | **Não** |
| Segredo da conciliação | Secrets → `CRON_SECRET` **e** Vault do banco (`cron_secret`) | **Não** |

Cadastro dos Secrets (requer o token pessoal do Supabase em `SUPABASE_ACCESS_TOKEN`):

```bash
npx supabase secrets set MERCADO_PAGO_ACCESS_TOKEN=... --remote=pjtlsiulnipynkierkez --yes
```
Ou pelo painel: **Edge Functions → Secrets**.

### 4.5 Publicar as Edge Functions

```bash
npx supabase functions deploy --remote=pjtlsiulnipynkierkez --use-api --yes
```
`supabase/config.toml` já define quais funções exigem login (`mp-webhook`, `mp-return` e `mp-reconcile` não exigem; têm proteção própria).

### 4.6 Configurar o webhook
1. Na aplicação: **Webhooks → Configurar notificações**.
2. URL (modo de teste **e** modo produção): `https://pjtlsiulnipynkierkez.supabase.co/functions/v1/mp-webhook`
3. Eventos: **Planos e assinaturas** e **Pagamentos** → **Salvar**.
4. Revele a **Assinatura secreta** e cadastre em `MERCADO_PAGO_WEBHOOK_SECRET` (Secrets).
5. **Validar:** botão **Simular notificação** → a resposta deve ser **200 - OK**. Com assinatura secreta errada, a resposta é 401.
6. Auditoria: toda notificação fica em `public.payment_events` (Table Editor ou SQL `select * from payment_events order by received_at desc;`), com `signature_valid` e o resultado.

### 4.7 Testar um pagamento
1. `npm run dev` → entre no site → **Minha conta** → informe o e-mail da conta Mercado Pago → **Assinar agora**.
2. Em uma **janela anônima**, entre no Mercado Pago com a **conta compradora de teste**.
3. Cartão de teste: Mastercard `5480 8328 0103 3311` (ou Visa `4235 6477 2802 5682`), validade `11/30`, CVV `123`, titular **`APRO`** (aprovado), CPF `12345678909`. Titular `OTHE` simula recusa; `CONT`, pendente.
4. Ao voltar, a página de retorno consulta o Mercado Pago e mostra **Assinatura ativa!**. Em **Minha conta**, a assinatura aparece como **Ativa** com a próxima cobrança.
5. Cancelamento: **Minha conta → Cancelar assinatura** (cancela no Mercado Pago e no banco).

### 4.8 Migrar para produção (somente com autorização)
1. Publicar o site com domínio https (Subetapa 7) e atualizar `SITE_URL` para `https://seu-dominio`.
2. Na aplicação Mercado Pago: **Credenciais → Produção** (pode exigir informar dados do negócio e ativar as credenciais).
3. Substituir nos Secrets: `MERCADO_PAGO_ACCESS_TOKEN` (produção) e, no `.env`/Vercel, `VITE_MERCADO_PAGO_PUBLIC_KEY` (produção).
4. **Remover** `MERCADO_PAGO_TEST_PAYER_EMAIL` dos Secrets (`npx supabase secrets unset MERCADO_PAGO_TEST_PAYER_EMAIL ...`).
5. Configurar o webhook no **Modo produção** e atualizar `MERCADO_PAGO_WEBHOOK_SECRET` com a assinatura secreta de produção.
6. Fazer **uma** assinatura real de R$ 10,00 com um cartão próprio, conferir ativação/registro e cancelá-la; o estorno, se desejado, é feito no painel do Mercado Pago.
7. Conferir que o preço em `public.plans` é o desejado.

## 5. E-mails — Resend (Subetapa 6)

### 5.1 Conta e chave
1. Crie a conta em <https://resend.com/signup> e confirme o e-mail.
2. **API Keys → Create API Key** → nome `atualidadeai-supabase`, permissão **Sending access** → copie a chave (`re_...`).
3. No `.env` (sem `VITE_`): `RESEND_API_KEY=re_...` e `EMAIL_TEST_TO=<e-mail da conta Resend>`.

### 5.2 Aplicar
```bash
npm run email:samples   # envia 7 exemplos para EMAIL_TEST_TO
npm run auth:email      # liga o Resend ao login do Supabase (SMTP + modelos + URLs)
npx supabase secrets set RESEND_API_KEY=... EMAIL_TEST_TO=... --remote=<ref> --yes
```
Secrets usados pelas Edge Functions: `RESEND_API_KEY`, `EMAIL_FROM` (opcional), `EMAIL_REPLY_TO` (opcional), `EMAIL_TEST_TO` (só em teste), `EMAIL_PROVIDER` (`log` desliga o envio).

### 5.3 Verificar
- Caixa de entrada do `EMAIL_TEST_TO` (confira também spam/promoções).
- Painel do Resend → **Emails**: status de cada envio (delivered, bounced…).
- Banco: `select kind, status, delivered_to, error, created_at from email_log order by created_at desc;`

### 5.4 Liberar envio ao público (quando houver domínio)
1. Registre o domínio (ex.: em <https://registro.br> para `.com.br`).
2. Resend → **Domains → Add Domain** → informe o domínio (recomendado um subdomínio, ex.: `mail.seudominio.com.br`).
3. Copie os registros DNS exibidos (SPF/MX e DKIM) para o painel DNS do domínio; clique em **Verify** até ficar **Verified**.
4. Recomendado: adicione também um registro DMARC (`_dmarc`, `v=DMARC1; p=none;`).
5. Atualize: `EMAIL_FROM="AtualidadeAI Concursos <contato@seudominio.com.br>"` no `.env` e nos Secrets; **remova** `EMAIL_TEST_TO` dos Secrets (`npx supabase secrets unset EMAIL_TEST_TO --remote=<ref> --yes`).
6. Rode `npm run auth:email` de novo (atualiza o remetente do login) e `npm run email:samples` para conferir.
7. Plano gratuito do Resend: limites diários/mensais — confira em <https://resend.com/pricing>.

## 6. Git e GitHub

- Repositório: `https://github.com/egrinaldo/atualidadeai-concursos` (privado).
- Histórico reiniciado em 05/11/2026 com um único commit limpo: os commits antigos tinham credenciais em `.env.example`.

### Fluxo de branches

| Branch | Uso | Publicação na Vercel |
| --- | --- | --- |
| `develop` | Todas as alterações entram aqui primeiro | Endereço de **prévia** (não afeta o site principal) |
| `main` | Somente código já conferido na prévia | **Produção** — `https://atualidadeai-concursos.vercel.app` |

```powershell
# trabalhar sempre na develop
git checkout develop
git add -A
git commit -m "feat: descrição curta"
git push                      # gera a prévia na Vercel
```

Depois de conferir a prévia: no GitHub, **Pull requests → New → base: `main` ← compare: `develop` → Create → Merge**. A Vercel publica a `main` em produção automaticamente.

Recomendado: *Settings → Branches* → regra para `main` exigindo Pull Request (se o plano do GitHub oferecer para repositórios privados).

## 7. Vercel

### 7.1 Projeto

| Item | Valor |
| --- | --- |
| Projeto | `atualidadeai-concursos` (plano **Hobby**) |
| Produção | `https://atualidadeai-concursos.vercel.app` (branch `main`) |
| Prévias | uma por branch/commit, ex.: `atualidadeai-concursos-git-develop-<conta>.vercel.app` |
| Framework / build / saída | definidos no `vercel.json`: Vite · `npm run build` · `dist` · `npm install` |

`vercel.json` também configura: redirecionamento de rotas da SPA para `index.html`, cabeçalhos de segurança (CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP) e cache longo para `/assets/`.

### 7.2 Variáveis de ambiente (Settings → Environment Variables)

Marque **Production** e **Preview** em todas:

| Nome | Valor |
| --- | --- |
| `VITE_SUPABASE_URL` | URL do projeto Supabase (sem `/rest/v1`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | chave pública (anon/publishable) |
| `VITE_MERCADO_PAGO_PUBLIC_KEY` | Public Key do Mercado Pago |
| `VITE_SITE_URL` | `https://atualidadeai-concursos.vercel.app` |

**Nunca** cadastre na Vercel Access Token, segredo do webhook, chave do Resend, service_role ou dados do banco: eles ficam somente nos *Secrets* do Supabase. O build falha de propósito se uma chave secreta for colocada numa variável `VITE_`.

Alterou uma variável? Ela só vale após novo deploy: **Deployments → ⋯ → Redeploy**.

### 7.3 Ajustes no Supabase ligados ao endereço do site (já aplicados)

| Onde | Valor |
| --- | --- |
| Secret `SITE_URL` (Edge Functions) | `https://atualidadeai-concursos.vercel.app` — retorno do checkout |
| Auth → Site URL | `https://atualidadeai-concursos.vercel.app` |
| Auth → Redirect URLs | **somente endereços exatos**: `https://atualidadeai-concursos.vercel.app/**` e `http://localhost:5173/**` |

Comando (reexecutável; sem `SITE_URLS` usa produção + localhost): `npm run auth:email`.

> ⚠️ **Nunca use curinga** (ex.: `projeto-*.vercel.app`) nas Redirect URLs: qualquer pessoa pode criar um domínio que casa com o padrão e receber links de login (vulnerabilidade V01 da auditoria). O script recusa curingas.
>
> Os links dos e-mails de confirmação e de recuperação apontam sempre para o **site oficial** (`{{ .SiteURL }}`), inclusive quando o cadastro é feito numa prévia ou em `localhost`. Para testar localmente, abra o link e troque o endereço por `http://localhost:5173` mantendo `?token_hash=...`.

Observação: o retorno do checkout sempre leva ao site de **produção**, mesmo quando a assinatura começa numa prévia (o `SITE_URL` é único). O status da assinatura aparece normalmente na prévia ao abrir `/conta`.

### 7.4 Domínio próprio e HTTPS

O endereço `*.vercel.app` já tem HTTPS automático. Para usar um domínio (ex.: `atualidadeaiconcursos.com.br`):

1. Vercel → projeto → **Settings → Domains → Add** → informe o domínio.
2. No registrador (Registro.br etc.), crie os registros DNS que a Vercel indicar (normalmente `A 76.76.21.21` para o domínio raiz e `CNAME cname.vercel-dns.com` para `www`).
3. Aguarde a verificação; o certificado HTTPS é emitido automaticamente.
4. Atualize `VITE_SITE_URL` (Redeploy), o secret `SITE_URL` e rode `npm run auth:email` com o novo endereço em `SITE_URLS`.
5. Verifique o mesmo domínio no Resend (§5.4) para enviar e-mails a qualquer destinatário.

### 7.5 Falhas de build e rollback

- Build com erro: o deploy aparece como **Error** em *Deployments*; o site continua na versão anterior. Clique no deploy → **Build Logs** para ver a mensagem (em geral erro de TypeScript; reproduza com `npm run build`).
- Versão publicada com problema: **Deployments → deploy anterior que funcionava → ⋯ → Instant Rollback**. Depois corrija na `develop` e repita o fluxo.

### 7.6 Limites do plano Hobby

O Hobby é gratuito e **somente para uso não comercial**; os termos da Vercel consideram comercial qualquer site que solicite ou processe pagamentos. Ele atende a fase de testes. **Antes de ativar cobranças reais, migre para o plano Pro** (Settings → Billing). Limites do Hobby relevantes: 100 GB de transferência/mês e builds um por vez — folgados para o tamanho atual do site (~82 kB de JavaScript comprimido na landing).

## 8. Worker da Etapa 2 (GitHub Actions)

1. **Chave secreta dedicada:** Supabase → Project Settings → API Keys → *Secret keys* → **Create new secret key** (nome: `worker`). Pode ser revogada sem afetar o site.
2. GitHub → repositório → **Settings → Secrets and variables → Actions → New repository secret**:
   `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (a chave do passo 1), `NVIDIA_API_KEY`.
3. GitHub → **Actions → worker-run → Run workflow → healthcheck**: confere banco, bucket e configuração.
4. Testes automáticos: workflow `worker-ci` a cada alteração em `worker/`.

Local: `cd worker && npm ci && npm test` · `npm run job -- healthcheck` (com as variáveis no ambiente).

### 8.1 Coleta agendada (Subetapa 2.2)

- Workflow `.github/workflows/worker-collect.yml`: cron `7 */3 * * *` (UTC) + execução manual. Executa coleta, triagem, agrupamento e verificação (`tick collect,triage,cluster,verify`).
- Usa os segredos `SUPABASE_URL` e `SUPABASE_SECRET_KEY` (Settings → Secrets and variables → Actions).
- O GitHub só executa agendamentos do branch padrão (`main`): o robô passa a rodar sozinho depois do merge.
- Detalhes: `docs/ROBO_NOTICIAS.md`.
