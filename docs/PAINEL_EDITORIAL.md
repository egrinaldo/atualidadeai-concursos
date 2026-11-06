# Painel editorial (Etapa 2.7)

Abas **Editorial**, **Fontes** e **Robô** no `/admin`. Mesmo controle de acesso do painel: login de administrador (`public.admins`) **com MFA** (código do app autenticador, sessão `aal2`), verificado **no servidor** pela Edge Function `editorial`, com limite de 180 requisições/minuto. Toda decisão fica em `editorial_reviews` (quem, quando, o quê, antes/depois).

## Editorial

- **Indicadores**: notícias nas últimas 24h, assuntos aguardando revisão, uso de IA no dia (chamadas/cota, tokens, erros) e fontes com falha.
- **Edições** (últimos dias): status, assuntos por bloco, PDF (versão, páginas, tamanho, QA). Ao abrir:
  - **Aprovar** (gera no próximo horário — 04h35 — ou ao disparar *worker-edition → render*), **Reter** (não gera) e **Gerar de novo** (libera nova versão de edição já gerada);
  - por bloco (Estado → Brasil → Mundo): **reordenar**, **remover** e **incluir** assuntos analisados da janela da edição;
  - PDFs gerados com relatório de QA e **Baixar** (link temporário de 5 minutos; o arquivo continua privado).
  - Qualquer mudança nos itens volta a edição para *em revisão*.
- **Fila de revisão**: assuntos com `needs_review` (verificação divergente/contradita, fonte única fraca, avisos da IA — número sem fonte, grafia de nome — ou análise reprovada). Ao abrir:
  - verificação (fontes independentes, números, atribuições), alertas da validação, a análise completa com as questões e todas as matérias com link;
  - **Aprovar**, **Editar** (cria nova versão "editada" com autor; a original fica no histórico; edições ainda não geradas passam a usar a versão editada), **Pedir nova análise** (o robô refaz na próxima rodada, usando cota de IA) e **Reprovar** (não entra em nenhuma edição).

## Fontes

Lista com grupo editorial, alcance, modo (resumo/completo/mapa), confiabilidade (editável), coletas e notícias novas em 7 dias, situação (OK/falhas/último erro) e a anotação dos **termos de uso**. **Ativar/Desativar** com um clique (reativar zera a espera por falhas).

**Nova fonte**: só feed RSS/Atom ou mapa de notícias em **https público** (recusa http, IP, `localhost`, nomes internos, credenciais e portas); o robô aceita apenas o servidor do próprio feed (proteção contra SSRF); veículo de imprensa entra sempre em **modo resumo**; é obrigatório registrar o que foi verificado no robots.txt e nos termos de uso.

## Robô

Uso de IA por dia (7 dias), últimas tarefas (coleta, triagem, agrupamento, verificação, análise, montagem, geração) com erros, falhas de coleta (48h) e **configurações** editáveis com validação: cota diária de IA, chamadas por rodada, análises por bloco, assuntos por bloco em cada edição, relevância mínima, limiar de agrupamento, confiabilidade mínima para fonte única e status de verificação aceitos.

## Implantação

- Função: `supabase functions deploy editorial --remote=<ref> --use-api --yes` (já publicada em 06/11/2026). `verify_jwt = true` em `supabase/config.toml`.
- Telas: entram no ar com o merge na `main` (Vercel).
- Migração 19 (tipos de decisão e índices) aplicada.
