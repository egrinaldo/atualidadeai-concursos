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

## Estrutura

| Pasta | Conteúdo |
| --- | --- |
| `src/config.ts` | Variáveis de ambiente validadas (erros mostram só nomes) |
| `src/db/` | Cliente Supabase (chave secreta) e fila `processing_jobs` |
| `src/jobs/` | Uma tarefa por arquivo (`healthcheck` na 2.1; demais nas próximas subetapas) |
| `src/lib/` | Log estruturado sem segredos, novas tentativas com espera exponencial |
| `src/runner.ts` | Laço da fila: isola falhas, reagenda com backoff |

Detalhes: `docs/ARQUITETURA.md` (Etapa 2) e `docs/CONFIGURACAO.md` (§8 Worker).
