# Worker — AtualidadeAI Concursos (Etapa 2)

Processamento agendado e independente do site: coleta de notícias, verificação,
análise por IA, montagem das edições, PDFs e entregas. Roda no **GitHub Actions**
(ver `.github/workflows/worker-*.yml`) ou localmente.

## Executar localmente

```bash
cd worker
npm ci
# variáveis (não versionar): SUPABASE_URL, SUPABASE_SECRET_KEY, NVIDIA_API_KEY
npm run job -- healthcheck          # confere banco, bucket e configuração
npm run job -- enqueue healthcheck  # coloca uma tarefa na fila
npm run job -- run                  # processa a fila
npm test && npm run typecheck
```

## Comandos

- `npm run job -- healthcheck` — testa conexão com o banco.
- `npm run job -- tick collect,triage,cluster` — enfileira cada etapa da janela de 3h atual e executa em ordem (usado pelo workflow).
- `npm run job -- run triage` / `run cluster` — processa triagem/agrupamento pendentes.
- `npm run job -- enqueue collect` / `npm run job -- run collect` — enfileirar e processar manualmente.
- Payload da coleta: `{"sourceId": "<uuid>", "force": true}` coleta uma fonte específica ignorando o intervalo.

Fontes, regras e operação: `docs/ROBO_NOTICIAS.md`.

## Estrutura

| Pasta | Conteúdo |
| --- | --- |
| `src/config.ts` | Variáveis de ambiente validadas (erros mostram só nomes) |
| `src/db/` | Cliente Supabase (chave secreta) e fila `processing_jobs` |
| `src/jobs/` | Uma tarefa por arquivo (`healthcheck` na 2.1; demais nas próximas subetapas) |
| `src/lib/` | Log estruturado sem segredos, novas tentativas com espera exponencial |
| `src/runner.ts` | Laço da fila: isola falhas, reagenda com backoff |

Detalhes: `docs/ARQUITETURA.md` (Etapa 2) e `docs/CONFIGURACAO.md` (§8 Worker).
