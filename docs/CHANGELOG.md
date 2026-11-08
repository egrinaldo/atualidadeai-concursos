# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [Não publicado] — Envio diário à prova de falhas e Bahia

### Corrigido
- **08/11/2026: nenhum PDF enviado às 06h.** Um disparo atrasado de 07/11 ocupou a vaga da publicação de 08/11. A vaga de publicação/limpeza/verificação passa a ser a data de hoje; rodada sem efeito não ocupa a vaga; `deliver@reforco` a cada coleta como rede de segurança (OPERACAO.md §1).
- Assinante de estado sem edição ficava sem PDF: agora todo assinante ativo recebe a edição do seu estado (sem fontes estaduais: Brasil e Mundo), e a verificação diária avisa.

### Adicionado
- Bahia: 7 fontes estaduais ativas e BA em `pipeline.pilot_states` (migração 27).

## [Não publicado] — Novo preço

### Alterado
- Assinatura mensal: **R$ 10,00 → R$ 9,99**, nos três lugares: plano no banco (migração 26), site e Termos de Uso, que usam o mesmo valor. Vale para novas assinaturas; não havia assinaturas ativas.

## [Não publicado] — Ilustrações com trechos reais

### Alterado
- **Página inicial:** as ilustrações do PDF tinham barras vazias e "tema fictício". Agora mostram **trechos reais** das edições publicadas (Ceará, 06 e 07/11/2026). Os textos ficam em `src/content/samples.ts`.
  - **Topo:** o Copom mantendo a Selic, com "Por que importa para a prova".
  - **Demonstração:** a crise no Paraguai com linha do tempo (05/11 → 06/11), "Para memorizar" e fontes, montada com fatos reais das diárias.
  - **Cartões menores:** títulos reais do diário e o conteúdo da mensal.
- **Seção de demonstração:** passa a listar as partes reais do PDF (o que aconteceu, por que importa, para memorizar, questões comentadas e fontes, linha do tempo).
- **Perguntas frequentes:**
  - novas: como evitamos informação errada, quando e onde chegam os PDFs, se é possível compartilhar;
  - o "Em breve teremos um canal de atendimento" deu lugar ao e-mail de contato.

## [Não publicado] — Site só com estadual, nacional e internacional

### Alterado
- **Página inicial, planos, perguntas frequentes e ilustração do PDF:** o texto deixa de falar em "regional", "cidade", "municipal" e "local". A cobertura passa a ser **Estadual**, nacional e internacional, igual ao que o informativo entrega.
- **Cadastro:** não pede mais a cidade, só o estado (minimização de dados, LGPD). A coluna `city` continua no banco para os cadastros antigos, sem uso. "Minha conta" deixa de mostrar a cidade.
- **Termos e Política de Privacidade:** "atualidades estaduais" e "estado (UF)"; deixa de citar município. Vigência 07/11/2026.

## [Não publicado] — Diária sem repetição

### Corrigido
- A diária de 07/11 repetiu 7 dos 14 assuntos da de 06/11. A janela de 12h antes do período, sem checar edições anteriores, deixava voltar o que já tinha saído.
- **Agora:** assunto já publicado numa diária dos últimos 10 dias só volta se houve **fato novo**: matérias depois do fim do período daquela edição **e** um texto novo. Nesse caso volta com o selo "Atualização — assunto publicado em DD/MM, com fatos novos".
- O mesmo fato agrupado em outro assunto, com título e resumo quase iguais aos de uma diária dos últimos 3 dias, também fica de fora (`edition.repeat_similarity`, padrão 0,6).
- `worker/src/pdf/repeats.ts` + 5 testes. Simulação com os dados reais de 07/11: sairiam exatamente os 7 repetidos.

## [Não publicado] — Domínio próprio

### Alterado
- Site em `https://www.atualidadeaiconcursos.com.br`; o endereço `atualidadeai-concursos.vercel.app` não responde mais.
- Supabase Auth: Site URL = domínio próprio; Redirect URLs com os dois domínios + `.vercel.app` + localhost.
- `SITE_URL` das Edge Functions (retorno do checkout) e padrão do worker (links dos e-mails) = domínio próprio.
- Página legal, rodapé do PDF e identificação do robô (User-Agent) com o domínio próprio.

## [Não publicado] — Etapa 2 · Subetapa 2.9: endurecimento antes das vendas

### Adicionado
- **Agendador confiável** (migração 24): pg_cron + pg_net disparam os workflows do GitHub nos horários certos.
  - `dispatch_workflow`, `dispatch_log`, `dispatch_recent`; token do GitHub guardado no Vault.
  - O agendador do GitHub fica como reserva. Rodadas das edições únicas por dia (`TICK_SLOT=edition`).
- **Verificação diária** (`healthcheck@diario`, depois das 06h). Confere:
  - edições publicadas e tarefas com falha;
  - coleta parada e fontes quebradas;
  - e-mails com falha, disparos recusados e erros da IA.

  Manda e-mail de alerta aos administradores **só** quando há problema.
- **Anti-robô Cloudflare Turnstile** (`useCaptcha`) no cadastro, login, recuperação e reenvio de confirmação. Ligado só com `VITE_TURNSTILE_SITE_KEY` + CAPTCHA no Supabase Auth; CSP liberada para `challenges.cloudflare.com`.
- **Dependabot** semanal (Actions e npm).
- `docs/OPERACAO.md`: rotina, ativações, checklist antes de vender e o que fazer quando algo dá errado.
- **Administradores recebem os informativos** como um cliente (`delivery.include_admins`, migração 23).

### Alterado
- Actions fixadas por SHA (`checkout` v5.1.0, `setup-node` v5.0.0).
- Mercado Pago 429 → 503 com `Retry-After` em criar/cancelar assinatura.
- Publicação "atrasada": se o PDF fica pronto depois das 06h, publica na hora (`deliver@atrasado`).

## [Não publicado] — Etapa 2 · Subetapa 2.8: personalização, publicação e entrega

### Adicionado
- `personalize`: cópia por assinante ativo da UF, com nome e e-mail na capa e no rodapé e código da entrega nos metadados (pdf-lib).
- `deliver`: publicação às 06h na área e e-mail opcional, um por assinante com os PDFs do dia em anexo; idempotente, com novas tentativas.
- `cleanup`: cópias com mais de 7 dias, PDFs base com mais de 90 dias e pastas de contas excluídas.
- Área do assinante: "Meus informativos" (`DocumentsPanel`), com download por link temporário.
- Função `account`: ações `documents` e `document_url`; a exclusão de conta apaga as cópias; a exportação inclui as entregas.
- Modelo de e-mail `renderEditionEmail`; migração 22; `docs/ENTREGA.md`; 6 testes.

### Alterado
- `worker-edition`: 04h35 `audit@pdf → render → personalize`; novo horário 05h57 `deliver → cleanup`; secrets do Resend.

## [Não publicado] — Etapa 2 · Subetapa 2.7c: revisão automática da fila

### Adicionado
- Job `review` (`worker/src/review/decide.ts`): o robô decide a fila de revisão com regras conservadoras.
  - Libera o que só aguarda confirmação: a seleção continua barrando.
  - Libera o texto já auditado.
  - Pede nova análise uma vez; depois, descarta.
  - O texto editado por pessoa e reprovado fica com o editor.
- Decisões registradas como "Robô:" em `editorial_reviews`.
- Painel: quadro com as decisões do robô (48h). "Aprovar" desfaz um descarte.
- Migração 21 (`review.auto`, `review.max_reanalysis`); 5 testes.

### Alterado
- `worker-collect` termina com `review`.
- `worker-edition` às 22h12: `audit@edicao → review@edicao → compose@diaria → synthesize → audit@periodo → compose@periodo`.

## [Não publicado] — Etapa 2 · Subetapa 2.7b: auditoria de veracidade e revisões semanal/mensal

### Adicionado
- **Auditoria de veracidade** (`worker/src/audit/`, job `audit`):
  - modelo auditor diferente do redator;
  - afirmações atômicas com trecho literal conferido na fonte sem IA;
  - checagem de dia da semana e data.
- Reprovação manda o assunto para revisão, com **correção automática** do texto da IA (até 2 rodadas, nova auditoria).
- Trava em três pontos: montagem, `render` e QA do PDF.
- **Revisões hierárquicas** (`worker/src/period/`, job `synthesize`):
  - semanal a partir das diárias e mensal a partir das semanais (+ diárias não cobertas);
  - o mesmo assunto em vários dias vira uma história com síntese e **linha do tempo**, auditada.
- Painel:
  - selo de auditoria nos itens;
  - quadro com as afirmações não sustentadas;
  - ações "Dispensar auditoria" (com justificativa registrada) e "Auditar de novo";
  - sínteses no detalhe do assunto;
  - 5 novas configurações.
- `tick` aceita `tipo@etiqueta` (rodadas separadas na mesma janela).
- Migração 20 (com gatilho que zera a auditoria de versões editadas); `docs/AUDITORIA_E_REVISOES.md`; 19 testes novos.

### Alterado
- `worker-collect` audita após a análise (timeout 50 min).
- `worker-edition`: 22h12 `compose@diaria → synthesize → audit@edicao → compose@periodo`; 04h35 `audit@pdf → render`; recebe `NVIDIA_API_KEY`.
- Cota diária de IA 60 → 120.
- Edição manual zera a auditoria.

## [Não publicado] — Etapa 2 · Subetapa 2.7: painel editorial

### Adicionado
- Abas **Editorial**, **Fontes** e **Robô** no `/admin` (`src/pages/admin/Editorial.tsx`, `src/lib/editorial.ts`).
- Edge Function `editorial` (administrador + MFA, limite de requisições): edições (aprovar/reter/gerar de novo, incluir/remover/reordenar assuntos, baixar PDF por link temporário), fila de revisão (aprovar, editar com versão, pedir nova análise, reprovar), fontes (ativar/desativar, confiabilidade, cadastro validado), configurações validadas e monitoramento do robô.
- Migração 19; `docs/PAINEL_EDITORIAL.md`; 7 testes Deno da validação.

### Alterado
- `Modal` do painel aceita largura maior (`wide`); aviso de sandbox aparece só nas abas financeiras.
- Workflows usam `actions/checkout@v5` e `actions/setup-node@v5` (Node 24).

## [Não publicado] — Etapa 2 · Subetapa 2.6: geração dos PDFs

### Adicionado
- Gerador de PDF próprio (`worker/src/pdf/`): template HTML/CSS com identidade do site, fontes Sora/Manrope embutidas, capa + miolo + gabarito comentado; Playwright 1.63 e pdf-lib 1.17.1.
- Jobs `compose` (edições diária/semanal/mensal por UF, ordem Estado → Brasil → Mundo) e `render` (PDF base, controle de qualidade, bucket privado, `generated_documents` com SHA-256).
- Workflow `worker-edition` (22h12 montagem; 04h35 geração, horário de Brasília); migração 18; `docs/GERACAO_PDF.md`.

### Corrigido
- Veículo estadual de imprensa (O Povo, CN7) publicava Brasil e mundo no bloco do estado: alcance agora pela seção do endereço e pelo conteúdo; 48 notícias reclassificadas.
- Corte de texto partia emoji ao meio e gerava JSON inválido no banco (`safeSlice`).

## [Não publicado] — Etapa 2 · Subetapa 2.5b: veículos de imprensa

### Adicionado
- 29 veículos de imprensa ativos (G1, O Globo, Valor, UOL, Folha, CNN Brasil, Poder360, Veja, Jovem Pan, CartaCapital, InfoMoney, Conjur, G1 Ceará, O Povo, CN7, BBC, DW, El País, Euronews, NPR) e Agência Gov, em modo resumo; 14 inativos com motivo (termos proíbem robôs ou feed parado).
- Mapa de notícias (Google News sitemap) como tipo de fonte; `content_mode` nas fontes (migração 17).
- Validação da IA: proibição de cópia literal e checagem de grafia de nomes; prompt `analise-v3`.
- Paginação das consultas (> 1.000 linhas) e processamento em lotes na triagem/agrupamento.

### Corrigido
- robots.txt agora é conferido também no destino de redirecionamentos.
- Verificação: desmentido só de outro grupo editorial; divergência numérica só entre títulos; "bi/mi/tri" reconhecidos.

## [Não publicado] — Etapa 2 · Subetapa 2.5: camada de IA (NVIDIA NIM)

### Adicionado
- Abstração de provedor de IA, implementação NVIDIA NIM, cota diária, registro de uso e troca automática de modelo (`worker/src/ai/`).
- Análise didática por assunto com prompt versionado (`analise-v2`), validação por schema, ancoragem de números nas fontes, checagem de acentuação e uma correção automática (`worker/src/analysis/`).
- Job `analyze` com seleção por bloco (estado → nacional → internacional), reaproveitamento por hash e limite por rodada; workflow roda `...,verify,analyze` com `NVIDIA_API_KEY`.
- Migração 16 + reversão; `docs/IA_NVIDIA.md`; 14 testes novos (63 no total).

### Alterado
- Assunto analisado que ganha matéria volta para verificação/reanálise.

## [Não publicado] — Etapa 2 · Subetapa 2.4: verificação das informações

### Adicionado
- Verificação determinística dos assuntos (`worker/src/verify/`): fontes independentes, fonte oficial, números coincidentes/divergentes, desmentidos e atribuições; 6 status, confiança e evidências só do banco.
- Job `verify`, reverificação automática quando o assunto ganha matérias; workflow roda `collect,triage,cluster,verify`.
- Migração 15 (resumo da verificação no assunto, `members_changed_at`, política editorial em `app_settings`) e reversão.
- `docs/VERIFICACAO_INFORMACOES.md`; 13 testes novos (49 no total).

## [Não publicado] — Etapa 2 · Subetapa 2.3: triagem, classificação e agrupamento

### Adicionado
- Triagem determinística (`worker/src/triage/`): idioma, descarte de ruído com motivo, categoria, alcance/UF e relevância 0–100 com motivos.
- Agrupamento de notícias sobre o mesmo fato (TF-IDF + cosseno, janela de 72h) com relevância do assunto e contagem de fontes independentes.
- Jobs `triage` e `cluster`; `tick` aceita várias etapas em sequência; workflow roda `collect,triage,cluster`.
- Migração 14 (colunas de triagem, índices, parâmetros em `app_settings`) e script de reversão.
- 16 testes novos (36 no total).

### Corrigido
- Idioma da fonte da Comissão Europeia (o feed "pt" publica em inglês).

## [Não publicado] — Etapa 2 · Subetapa 2.2: robô de coleta

### Adicionado
- Robô de coleta (`worker/src/jobs/collect.ts`): RSS/Atom/API IBGE, robots.txt (RFC 9309), cache HTTP, deduplicação por URL e por conteúdo, backoff por fonte.
- Requisição segura contra SSRF (`worker/src/sources/fetcher.ts`): só HTTPS, hosts permitidos por fonte, bloqueio de IPs internos, limites de tamanho/tempo/redirecionamento.
- Migração 13: coluna `news_sources.language`, tabela `source_fetch_logs`, 19 grupos e 24 fontes verificadas (18 ativas).
- Workflow `worker-collect` (a cada 3h) e comando `tick`.
- `docs/ROBO_NOTICIAS.md`.

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
