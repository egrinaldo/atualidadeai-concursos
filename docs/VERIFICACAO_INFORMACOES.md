# Verificação das informações (Etapa 2.4)

Cada **assunto** (grupo de notícias sobre o mesmo fato) é verificado antes de poder entrar numa edição. A verificação é **determinística e auditável**: usa somente as notícias e fontes já gravadas no banco — nada é inventado, buscado fora ou gerado por IA. Código: `worker/src/verify/` e `worker/src/jobs/verify.ts`.

## O que é conferido

1. **Fontes independentes** — matérias do mesmo grupo editorial (ex.: as três editorias da Agência Brasil) contam como **uma** fonte.
2. **Fonte oficial/primária** — órgão que é a origem do fato (IBGE, Câmara, Senado, STF, Banco Central, ONU…), marcada em `news_sources.is_primary`.
3. **Números** — percentuais, valores em dinheiro (R$, €, US$) e quantidades ("27.279 vagas") de fontes independentes que falam da mesma coisa:
   - **coincidem** (arredondamentos até 5% aceitos em quantidades) → registrado como reforço;
   - **divergem** → só quando ambos estão no **título** e com contexto muito parecido (resumo e corpo trazem outras medidas — receita × lucro × dívida — e só servem para confirmar coincidências). Abreviações "bi", "mi", "tri" são entendidas.
4. **Desmentidos** explícitos ("desmente", "é falso", "boato", "fake news"…) no título de uma fonte de **outro grupo editorial** (matéria de um veículo *sobre* um boato não conta como desmentido). Termos genéricos como "nega" não contam ("STF nega pedido" é decisão, não desmentido).
5. **Atribuição** — a quem a matéria atribui a informação ("segundo o IBGE", "de acordo com o Ministério da Saúde").

## Resultado (6 status)

| Status | Quando | Confiança | Revisão humana |
| --- | --- | --- | --- |
| `corroborada` | ≥ 2 fontes independentes com uma oficial (alta) · ou ≥ 3 independentes (média) | alta/média | não |
| `parcialmente_corroborada` | só a fonte oficial publicou · ou 2 independentes não oficiais | média (baixa se sem texto) | não |
| `nao_confirmada` | fonte única não oficial | baixa | se relevância alta **e** confiabilidade < mínimo (padrão 4/5) |
| `insuficiente` | fonte única, não oficial e só título (sem texto) | baixa | se relevância alta |
| `fontes_divergentes` | números do fato principal diferem entre fontes | baixa | **sempre** |
| `contradita` | há desmentido explícito de outra fonte | baixa | **sempre** |

Cada verificação grava em `news_verifications` (histórico): afirmações extraídas, **evidências** (fonte, link e trecho de cada matéria — só do banco), notícias que sustentam e que contradizem, nº de fontes independentes e um texto explicando a conclusão. O resumo vai para o assunto (`news_clusters.verification_status`, `verification_confidence`, `needs_review`, `verified_at`).

## Política editorial (padrão)

- Podem entrar na edição: `corroborada`, `parcialmente_corroborada` e `nao_confirmada` com fonte de confiabilidade ≥ 4 — esta **sinalizada no PDF como "fonte única"** (`app_settings`: `verification.edition_statuses`, `verification.single_source_min_reliability`).
- `fontes_divergentes`, `contradita` e `insuficiente` ficam fora até decisão no painel (Subetapa 2.7).
- A IA (Subetapa 2.5) não decide se um fato é verdadeiro: ela redige a análise a partir das evidências já verificadas, e qualquer afirmação nova sem fonte no banco é rejeitada.

## Reverificação

Quando um assunto ganha matéria nova, o agrupamento atualiza `members_changed_at` e devolve o assunto verificado para `open`; a próxima rodada verifica de novo (o histórico guarda todas as versões). Assuntos sem mudança não são reverificados.

## Com veículos de imprensa (06/11/2026)

Com 29 veículos ativos, os assuntos **corroborados** por fontes independentes passaram de 5 para 28 na mesma janela; a maior parte dos assuntos de fonte única é agora de veículos com confiabilidade 4 (entram sinalizados como "fonte única") ou 3 (só entram se confirmados por outra fonte).

## Limitações conhecidas

- A comparação numérica é conservadora: prefere não acusar divergência a acusar uma falsa. Divergências descritas só em palavras ("cresce" × "cai") não são detectadas — a revisão editorial e a IA (2.5) complementam.
- Fontes do pilar estadual (CE) costumam ser órgãos publicando os próprios atos: tendem a `parcialmente_corroborada`.
- Os links das evidências não são reacessados (evita requisições extras às fontes); eles vêm da coleta.
