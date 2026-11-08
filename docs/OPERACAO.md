# Operação — AtualidadeAI Concursos

Manual do dia a dia do robô e do informativo: o que roda e quando, como ativar o que depende de você e o que fazer quando algo dá errado.

## 1. Rotina automática (horário de Brasília)

| Hora | O que acontece | Onde |
|---|---|---|
| A cada 3h (00h07, 03h07, …) | Coleta → triagem → agrupamento → verificação → análise (IA) → auditoria de veracidade → revisão automática → **reforço da publicação** (depois das 06h, publica/envia o que ainda não saiu; antes das 06h não faz nada) | `worker-collect` |
| 22h12 | Auditoria pendente → revisão automática → **monta a diária** de amanhã → (segunda/dia 1) sínteses → auditoria → monta semanal/mensal | `worker-edition` (compose) |
| 22h00–04h30 | **Prazo de revisão do editor** no painel (opcional: o robô já decidiu a fila) | Painel → Editorial |
| 03h41 | Retenção LGPD do banco (`apply_retention`) | pg_cron `lgpd-retencao` |
| 04h35 | Auditoria final → **PDF base** → cópias personalizadas → (se já passou das 06h) publicação | `worker-edition` (render) |
| 05h57 → 06h00 | **Publicação**: área do assinante + e-mail → limpeza (7/90 dias) → verificação diária (e-mail de alerta só se algo falhou) | `worker-edition` (deliver) |
| A cada 6h | Conciliação de pagamentos do Mercado Pago | pg_cron `mp-reconcile` |

**Quem dispara:** os horários são acionados pelo **Supabase** (`pg_cron`, que chama a API do GitHub). As edições usam **só** esse disparo: o agendador do GitHub atrasou até 13h em 06–07/11, e uma montagem atrasada para depois do meio-dia montaria a edição seguinte cedo demais. A coleta mantém o agendador do GitHub como reserva. A resposta do GitHub a cada disparo fica em `dispatch_log` (copiada a cada 10 min pelo pg_cron `dispatch-capture`).

**Disparo duplicado ou atrasado não repete trabalho:** as rodadas das edições são únicas por dia (`TICK_SLOT=edition`). Montagem e PDF usam a data da edição preparada; **publicação, limpeza e verificação usam a data de hoje**. Uma rodada que terminou sem fazer nada (ex.: "antes das 06h") não ocupa a vaga.

**Incidente de 08/11/2026:** um disparo antigo do agendador do GitHub chegou atrasado ao meio-dia de 07/11 e, pela regra antiga (vaga = data da *próxima* edição), ocupou a vaga da publicação de 08/11 sem ter nada a publicar. Às 06h de 08/11 a publicação e a verificação diária foram descartadas como "duplicadas": nenhum PDF saiu e nenhum alerta foi enviado. Correções: vaga pela data de hoje, rodada sem efeito não conta e o reforço a cada coleta (até 06h07 o envio sai mesmo se o disparo das 05h57 se perder).

**Estados:** cada assinante ativo (e administrador) recebe a edição do seu estado. Estados em `pipeline.pilot_states` com fontes estaduais ativas têm o bloco estadual; os demais recebem Brasil e Mundo, e a verificação diária avisa "falta cadastrar fontes estaduais". Cobertura estadual em 08/11/2026: **CE e BA**.

## 2. Ativações que dependem de você

### 2.1 Agendador confiável (token do GitHub) — **prioridade alta**
1. GitHub → foto do perfil → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
   - **Name:** `supabase-agendador`.
   - **Expiration:** 1 ano. Anote a data para renovar.
   - **Repository access:** *Only select repositories* → `atualidadeai-concursos`.
   - **Permissions → Repository → Actions:** *Read and write*. Nada além disso.
2. Copie o token (`github_pat_…`).
3. Supabase → **Project Settings → Vault → Add new secret**.
   - **Name:** `github_dispatch_token`.
   - **Secret:** o token.
4. Pronto. O próximo horário já dispara pelo Supabase. Para conferir, use o SQL Editor do Supabase. O GitHub responde 204 quando aceita:
   ```sql
   select * from public.dispatch_recent(24);
   ```
5. **Token vencido ou revogado:** o alerta das 06h avisa ("disparo(s) recusado(s) pelo GitHub"). Gere outro token e atualize o segredo no Vault.

### 2.2 Anti-robô (Cloudflare Turnstile) no cadastro, login e recuperação de senha
Ligue **as duas pontas juntas**: só o site sem o Supabase não protege; só o Supabase sem o site trava o login.

1. Em https://dash.cloudflare.com → **Turnstile → Add widget**.
   - **Hostname:** o domínio do site (e `localhost` para testes).
   - **Modo:** *Managed*.
   - Anote a **Site key** (pública) e a **Secret key**.
2. Na Vercel, em **Settings → Environment Variables**, crie `TURNSTILE_SITE_KEY` (ou `VITE_TURNSTILE_SITE_KEY`) = Site key e faça um novo deploy. É a chave **do site**, pública; a secreta vai só para o Supabase.
3. Confira que a caixa de verificação aparece em `/entrar`, `/cadastro` e `/recuperar-senha`.
4. No Supabase, em **Authentication → Attack Protection → Enable CAPTCHA protection**, escolha *Turnstile* e cole a Secret key.
5. Teste: login, cadastro e recuperação de senha.

### 2.3 E-mail aos assinantes
- **Situação:** ligado (`delivery.email_enabled = true`). Os administradores também recebem (`delivery.include_admins`).
- **Remetente:** `AtualidadeAI Concursos <informativo@mail.atualidadeaiconcursos.com.br>`. O domínio `mail.atualidadeaiconcursos.com.br` está verificado no Resend (São Paulo).
- **Desligar em emergência:** Painel → Configurações, ou no SQL Editor:
  ```sql
  update app_settings set value = 'false' where key = 'delivery.email_enabled';
  ```

### 2.4 Antes de vender (checklist)
1. **Rotação de credenciais** (V14):
   - Mercado Pago: credenciais e segredo do webhook;
   - Supabase: token pessoal e senha do banco;
   - NVIDIA: chave.

   Atualize o `.env` local e os Secrets do GitHub (ambiente `production`) e os das funções do Supabase.
2. **Credenciais de produção do Mercado Pago** e novo segredo do webhook (CONFIGURACAO §4.8).
3. **Provedor de IA licenciado** no lugar do NVIDIA gratuito: os termos do NVIDIA são só para testes (IA_NVIDIA.md).
4. **Revisão jurídica:** uso das fontes de imprensa em modo resumo (ROBO_NOTICIAS.md) e Termos/Política. O CNPJ/endereço é exigido pelo Decreto 7.962/2013 nas vendas online.
5. **Turnstile ligado** (2.2) e Vercel → Deployment Protection ativo nas prévias.
6. Remover `EMAIL_TEST_TO` e `MERCADO_PAGO_TEST_PAYER_EMAIL` dos Secrets, se ainda existirem.
7. **Uma compra real de baixo valor**, de ponta a ponta: pagamento → acesso → PDF às 06h → e-mail.

## 3. Quando algo dá errado

| Sintoma | O que fazer |
|---|---|
| Alerta "recebem o PDF sem o bloco estadual" | Assinante de um estado sem fontes. Cadastre fontes estaduais (ROBO_NOTICIAS.md → Regras para novas fontes) e inclua a UF em `pipeline.pilot_states` (ex.: migração 27, Bahia) |
| Alerta "Edição diária … não foi montada" | GitHub → Actions → **worker-edition → Run workflow → step: compose** (sem `origem`). Depois **render** e **deliver** |
| Alerta "não publicada" / PDF não saiu | Painel → Editorial → abra a edição (QA e situação). Ajuste e use **Gerar de novo**, depois rode **render** e **deliver** |
| Alerta "Nenhuma coleta nas últimas 7h" | Rode **worker-collect** à mão. Se o problema persistir: `select * from dispatch_recent(24)` e o token (2.1) |
| Alerta "disparo(s) recusado(s) pelo GitHub" | Token vencido ou sem permissão: gere outro (2.1) |
| Alerta "e-mail(s) do informativo falharam" | Resend → **Logs**. A próxima publicação tenta de novo (até 3x). Domínio desverificado? Resend → Domains |
| "Tarefa … falhou" | Painel → **Robô** (último erro de cada etapa). Os erros de fonte aparecem em Painel → Fontes |
| Matéria com dado errado já publicada | Painel → abra o assunto → **Editar** (a nova versão é auditada) → edição → **Gerar de novo** → rode render e deliver |
| Muitas matérias reprovadas na auditoria | Painel → Editorial → quadro do robô. Se for o auditor (falsos alarmes), use "Auditar de novo" ou dispense com justificativa |
| Perdeu o celular do MFA | SQL: `delete from auth.mfa_factors where user_id = '<seu id>';`. Cadastre de novo no próximo acesso |
| Quer pausar tudo | Desligue os agendamentos: `update cron.job set active = false where jobname like 'worker-%';` e GitHub → Actions → *Disable workflow* (`worker-collect` e `worker-edition`) |

## 4. Onde olhar

- **Painel → Editorial:** edições, fila, decisões do robô e auditoria.
- **Painel → Robô:** tarefas e uso da IA.
- **Painel → Fontes:** saúde das fontes.
- **Supabase → SQL Editor:**
  - `select * from dispatch_recent(24);` (disparos);
  - `select jobname, schedule, active from cron.job;` (agendamentos);
  - `select * from cron.job_run_details order by start_time desc limit 20;` (execuções).
- **GitHub → Actions:** logs de cada execução do robô (sem segredos: o log redige chaves).
- **Resend → Logs:** e-mails.

## 5. Segurança (estado em 07/11/2026)

- **RLS:** todas as tabelas `public` estão com RLS ligado. O papel anônimo só lê `plans`.
- **Funções SECURITY DEFINER:** a única executável pelo site é `capture_lead` (com limite de uso). Agendador, retenção e fila só rodam como `service_role`.
- **Storage:** o bucket `documents` é privado e não tem políticas públicas. Download só por link temporário gerado no servidor: 5 min para o editor, 2 min para o assinante e só a própria cópia.
- **GitHub Actions:** ações fixadas por commit (SHA), permissões `contents: read`, segredos no ambiente `production`. O Dependabot propõe atualizações semanais.
- **Mercado Pago 429:** vira 503 "tente em alguns segundos" com `Retry-After`.
