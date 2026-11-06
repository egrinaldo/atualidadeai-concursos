# Camada de IA — NVIDIA NIM (Etapa 2.5)

A IA **redige a análise didática** de cada assunto já verificado. Ela não coleta, não decide o que é verdade e não escolhe fontes: recebe só as matérias do banco e tem a saída validada antes de qualquer uso. Código: `worker/src/ai/` (provedor) e `worker/src/analysis/` (prompt, validação, seleção).

## Arquitetura

- **Abstração de provedor** (`ai/types.ts`): o worker só conhece `AIProvider.chat(model, req)`. Trocar a NVIDIA por um provedor pago/licenciado = nova implementação dessa interface, sem mexer no restante.
- **NVIDIA NIM** (`ai/nvidia.ts`): API compatível com OpenAI em `https://integrate.api.nvidia.com/v1`. A chave (`NVIDIA_API_KEY`) fica só no worker (segredo do GitHub Actions); nunca vai ao site/navegador, e logs redigem `nvapi-…`.
- **Cliente** (`ai/client.ts`): cota diária (toda tentativa conta), registro de cada chamada em `ai_usage_logs` (modelo, tokens, latência, status) e troca automática para o próximo modelo da lista se um falhar (indisponível, limite, tempo esgotado, erro 5xx).

## Modelos (verificados na conta em 05/11/2026)

O catálogo lista 84 modelos, mas a maioria responde 404 "not found for account". Varredura de 40 candidatos:

| Modelo | Situação | Uso |
| --- | --- | --- |
| `nvidia/nemotron-3.5-lightning-30b-a3b` | responde, ~15–25 s por análise, JSON consistente | **principal** (raciocínio desligado via `chat_template_kwargs`) |
| `nvidia/nemotron-3-ultra-550b-a55b` | responde, ~40 s, tende a citar fatos fora das fontes (barrados pela validação) | reserva |
| `minimaxai/minimax-m3.1-flash`, `mistralai/mistral-large-4-1t-a52b` | respondem, mas gastam tokens com raciocínio | não usados |
| demais (llama, gemma, mistral-large-2, gpt-oss…) | 404/410 ou tempo esgotado | — |

A lista fica em `app_settings` → `ai.models` (`{"analysis": [...]}`); `NVIDIA_MODEL` (variável de ambiente) força um modelo à frente.

## Seleção e cota

- Analisa só assuntos **verificados e elegíveis** (relevância ≥ média, status de verificação permitido, sem revisão pendente), os **mais relevantes de cada bloco**: estado de cada UF piloto (5), nacional (6), internacional (4) — `ai.analysis_per_block`.
- Blocos intercalados: se a cota acabar, nenhum bloco fica vazio. Assuntos já analisados continuam ocupando a vaga (não se desce na fila gastando cota).
- Limites: `ai.daily_call_budget` = 60 chamadas/dia (dia de Brasília), `ai.max_calls_per_run` = 6 por rodada, janela `ai.lookback_hours` = 36h.
- **Reaproveitamento**: a entrada (fontes + bloco + verificação) gera um hash; mesma entrada + mesma versão do prompt = reaproveita a análise sem nova chamada. Assunto que ganha matéria volta para verificação e, se a entrada mudar, é reanalisado.
- Sem `NVIDIA_API_KEY`, a etapa é ignorada sem falhar o restante do robô.

## Prompt e validação (anti-alucinação)

Prompt versionado (`analysis/prompt.ts`, versão atual `analise-v2`): usar só as fontes numeradas; nenhum número/data/nome fora delas; projeções separadas de fatos; neutralidade; português com acentuação; nomes de órgãos traduzidos; resposta só em JSON.

Validação (`analysis/validate.ts`) de toda resposta:

1. **Formato** (schema zod): todos os campos, tamanhos, 1–3 questões com 5 alternativas distintas e gabarito.
2. **Números ancorados nas fontes**: em título, resumo, fatos, "memorizar", consequências confirmadas, enunciado, comentário e alternativa correta, todo número precisa constar no texto, título, URL ou data das fontes → senão é **erro**. Em contexto/análises vira **aviso** e o assunto vai para revisão humana. Distratores das questões podem ter números errados (é o objetivo deles).
3. **Acentuação**: 3+ palavras comuns sem acento → erro. Nomes em inglês → aviso.
4. **Referências**: só URLs das fontes; o resto é removido.

Resposta inválida → os erros voltam ao modelo e ele corrige **uma** vez. Persistindo, a análise é gravada como `invalid` (com os erros) e o assunto vai para revisão — nada inválido segue para o PDF.

## Resultado do teste real (05–06/11/2026)

18 assuntos analisados (7 Ceará, 6 nacionais, 5 internacionais), 25 chamadas (de 60), ~72 mil tokens, 17,5 s em média; 5 respostas fora do padrão corrigidas na segunda tentativa; 1 erro 502 da NVIDIA (refeito na rodada seguinte); 1 análise sem acentuação refeita com o prompt v2.

## Licença e produção

O uso gratuito da NVIDIA (Developer Program) é **apenas para testes/não produção**. Antes de atender assinantes pagantes é obrigatório trocar para um provedor com licença comercial (NVIDIA AI Enterprise ou outro), o que só exige um novo `AIProvider` e ajustar `ai.models`.

## Operação

- Uso do dia: `select model, status, count(*), sum(total_tokens) from ai_usage_logs where created_at >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' group by 1,2;`
- Análises: `select c.scope, c.state, a.editorial_title, a.status, a.validation_errors from news_analyses a join news_clusters c on c.id = a.cluster_id order by a.generated_at desc;`
- Rodar à mão (local): `npm run job -- run analyze` (payload `{"maxCalls": n}` limita chamadas numa execução manual).
