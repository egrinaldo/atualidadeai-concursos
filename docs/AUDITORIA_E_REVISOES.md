# Auditoria de veracidade e revisões semanal/mensal

Subetapa 2.7b. Garante que **nenhum dado errado chegue ao PDF** e monta as revisões semanal e mensal **a partir das edições já publicadas**.

## 1. Auditoria de veracidade

### Como funciona

1. **Outro modelo audita.** O texto é escrito pelo `nemotron-3.5-lightning` e auditado pelo `nemotron-3-ultra-550b`, para que o modelo não confira o próprio trabalho. Os modelos ficam em `ai.models.audit`.
2. **O auditor desmonta o texto em afirmações atômicas** e classifica cada uma como `apoiada`, `parcial`, `sem_suporte` ou `contradita`. A verificação cobre título, resumo, "o que aconteceu", "para memorizar", efeitos confirmados, questões, gabarito e linha do tempo.
3. **Para cada afirmação, copia o trecho literal da fonte que a sustenta.**
4. **O sistema confere o trecho sem IA** (`quoteInSource`):
   - a comparação ignora acentos, pontuação e espaços;
   - frases separadas na fonte e reticências (`…`, `[...]`) são aceitas, desde que cada frase exista;
   - só casa palavra inteira;
   - trechos curtos valem se tiverem conteúdo ("precursor chemicals" vale, "o presidente" não);
   - o cabeçalho da fonte (veículo + data de publicação) também vale, porque a data dos fatos pode vir dele.

   **Afirmação dada como "apoiada" sem trecho encontrado vira "sem suporte".**
5. **Checagens determinísticas:**
   - o dia da semana precisa bater com a data ("quinta-feira (5/11)");
   - a data precisa existir.

### Quando reprova

- Alguma afirmação `contradita`.
- Afirmação `sem_suporte` em campo crítico (título, resumo, o que aconteceu, para memorizar, efeitos, questões, linha do tempo).
- Afirmação `parcial` em título, "para memorizar" ou questão (o aluno decora ou responde aquilo).
- Mais de 2 afirmações `parcial` no total.
- Dia da semana ou data errados.
- Questão do tipo "assinale a INCORRETA" cuja alternativa marcada seja verdadeira.

### O que acontece com o texto reprovado

1. O assunto vai para a fila de revisão (`needs_review`).
2. **Correção automática** (texto da IA, até 2 rodadas): o redator recebe a lista de problemas e reescreve só esses pontos.
   - A correção passa pela validação de sempre (números ancorados, acentuação, cópia literal etc.). Se não passar, há uma nova tentativa com o outro modelo.
   - A versão corrigida substitui a anterior, inclusive nas edições ainda abertas, e é **auditada de novo**.
   - Aprovada, o assunto sai da revisão.
3. Texto editado por pessoa nunca é corrigido pela IA. Ele é auditado e, se reprovar, fica com o editor.

### A trava no PDF

- **Montagem:** a edição não usa texto reprovado nem com erro de auditoria.
- **Antes do PDF:** o fluxo das 04h35 roda `audit@pdf`, que audita tudo que estiver pendente nas edições abertas, com limite maior por rodada.
- **Geração:** o `render` deixa fora do PDF qualquer texto que não esteja `aprovada` ou `dispensada` e registra isso no QA.
- **QA:** reprova o PDF se algum item sem auditoria aprovada escapar.
- **Edição por pessoa:** um gatilho no banco (`news_analyses_reset_audit_on_edit`) faz toda versão editada nascer `pendente`. Assim, um texto editado nunca herda a aprovação do anterior.

### Decisão do editor (painel → Editorial → assunto)

- **Auditoria de veracidade:** mostra o resultado, as afirmações não sustentadas com o trecho citado e o modelo auditor.
- **Dispensar auditoria:** libera o texto para o PDF. Exige justificativa (≥ 10 caracteres) e fica registrado em `editorial_reviews` como `waive_audit`.
- **Auditar de novo:** devolve o texto à fila (`request_audit`).
- **Caminho preferido:** corrigir em "Editar". A nova versão é auditada automaticamente.

### Resultado real (edição 06/11, CE, 14 matérias)

**Placar final:** 14/14 aprovadas.

| Situação | Matérias |
|---|---|
| Aprovadas de primeira | 8 |
| **Erro real encontrado e corrigido automaticamente** | 2 |
| Falsos alarmes do conferidor (corrigidos no código, com teste) | 4 |

**Erros reais:**
- Produção industrial: o texto dizia "em relação a setembro de 2025 houve queda", mas a fonte do IBGE é cortada exatamente nesse ponto.
- Eleições nos EUA:
  - o título dizia "primeira mulher negra eleita ao Senado", sem nenhuma fonte;
  - a primeira correção trocou isso por "reelegeram a senadora Tammy Baldwin", também errado (a fonte diz que ela "segue no cargo"). O prompt do auditor ficou mais rígido com dedução (v2) e a segunda rodada saiu correta.

**Falsos alarmes:** horários ("13h às 17h"), reticências entre colchetes, espaço antes da vírgula, termos técnicos curtos e data tirada do cabeçalho.

**Custo:** ~35–50 s e ~4–5 mil tokens por auditoria (modelo ultra).

### Limitações conhecidas

- O auditor é um modelo: ele pode aceitar uma dedução como fato. Mitigações:
  - trecho literal obrigatório e conferido;
  - regras explícitas contra dedução e mudança de tempo verbal;
  - "parcial" reprova nos campos que o aluno decora;
  - o editor vê as afirmações parciais no painel.
- Tradução imprecisa em texto corrido pode passar como "parcial". Exemplo: "vessel flag State capacity" virou "flagrar navios" quando deveria ser "Estado de bandeira". Fica visível no painel, mas não reprova sozinha.
- A auditoria só confere contra as fontes coletadas. Se todas as fontes errarem igual, o erro passa. Para isso existe a verificação cruzada (Subetapa 2.4).

## 2. Revisões semanal e mensal (hierárquicas)

### Calendário (horário de Brasília)

- **Semanal:** sai na segunda. Usa os itens das diárias de terça a segunda (datas de referência W−6…W). A diária da segunda é montada no mesmo fluxo, um passo antes.
- **Mensal:** sai no dia 1. Usa os itens das **semanais** do mês, mais as diárias que nenhuma semanal cobriu.
  - Cobertura: diárias do dia 2 do mês anterior até o dia 1 atual, porque a diária do dia D traz os fatos de D−1.

### Montagem

1. **Entradas:** cada texto que saiu numa edição anterior, com as datas em que apareceu.
   - Texto editado depois da edição usa a versão atual.
   - Texto reprovado na auditoria não entra.
2. **Histórias:** a mesma notícia em dias diferentes vira uma história só. O critério é ter algum cluster em comum ou título+resumo parecidos (TF-IDF ≥ `synthesis.similarity_threshold`, padrão 0,4, só dentro do mesmo bloco).
3. **Peso da história:** relevância do assunto + até 24 pontos por presença em vários dias + até 6 por mais de um texto + até 5 por número de fontes.
4. **Escolha:** as de maior peso por bloco, conforme `edition.items_per_block.semanal|mensal`.
5. **Texto de cada história:**
   - um texto só → reaproveita esse texto, que já foi auditado;
   - vários textos → **síntese** (`synthesize`, prompt `sintese-v1`).

### A síntese

- **Entrada:** só os NOSSOS textos anteriores da história, em ordem cronológica, cada um com a data dos fatos.
- **Saída:** mesmo formato da análise, mais a **linha do tempo** (DD/MM + fato) e 2 questões novas de revisão.
- **Validação:**
  - números ancorados nos textos;
  - acentuação;
  - nomes;
  - **datas da linha do tempo** precisam ser a data dos fatos de algum texto ou uma data escrita neles. A data da edição é recusada; esse foi um erro real visto no teste.
- **Gravação:** a síntese fica em `news_analyses` com `kind = sintese_semanal|sintese_mensal` e, em `period_meta`, os clusters, as análises de origem, as datas, a linha do tempo e o snapshot das fontes usadas.
- **Auditoria:** a síntese passa pela mesma auditoria, contra esses textos de origem (que já foram auditados contra as matérias originais).
- **Reaproveitamento:** mesma história + mesmos textos não geram de novo (hash).
- **Se falhar:** se a síntese for inválida ou reprovada, a revisão usa o texto mais recente da história, que já foi auditado.

### Fluxo das 22h12 (`worker-edition`)

```
compose@diaria → synthesize → audit@edicao → compose@periodo
```

A etiqueta depois do `@` cria uma rodada própria na mesma janela de 3h e chega à tarefa como `payload.stage`.

### No PDF

- História com síntese mostra o box **"Linha do tempo"** e o selo "Acompanhado em N edições diárias (dd/mm a dd/mm)".
- No painel, os itens mostram o tipo (síntese semanal/mensal) e a situação da auditoria.

## 3. Revisão automática da fila (migração 21, job `review`)

**Quando roda:**
- a cada 3h, logo depois da auditoria;
- às 22h12, antes de montar as edições.

O robô decide cada assunto marcado "precisa de revisão" com regras fixas (`worker/src/review/decide.ts`). **Na dúvida, o assunto fica fora da edição.**

| Situação | Decisão do robô |
|---|---|
| Fonte única não confirmada, informação insuficiente, fontes que se contradizem ou divergem | **Liberado da fila** (registro "Liberado"). Continua fora da edição pela regra de verificação; entra sozinho se outra fonte confirmar |
| Texto auditado e aprovado (ou dispensado), com aviso da validação | **Liberado** para a edição: a auditoria já conferiu os fatos |
| Auditoria pendente | Espera a próxima rodada |
| Análise inválida ou reprovada na auditoria (mesmo após a correção automática) | **Nova análise do zero**, 1 vez por assunto (`review.max_reanalysis`). A nova também passa por validação e auditoria |
| Falhou de novo | **Descartado** (fora das edições) |
| Texto editado por pessoa e reprovado na auditoria | Fica com o editor |

**Registro:** toda decisão vai para `editorial_reviews` com revisor vazio e nota "Robô: …".

**No painel:** o quadro "Revisão automática — decisões do robô nas últimas 48h" mostra cada decisão. Para desfazer, basta abrir o assunto:
- **Aprovar** desfaz um descarte;
- **Pedir nova análise** e **Reprovar** funcionam como antes.

**Desligar:** `review.auto = false` (a fila volta a ser manual).

**Primeira execução (06/11):** 19 assuntos na fila, dos quais 15 liberados (8 de fonte única, 5 com informação insuficiente, 1 com fontes contraditórias e 1 com texto já auditado) e 4 com nova análise pedida. A fila ficou vazia.

## 4. Configurações (migrações 20 e 21)

| Chave | Padrão | O que faz |
|---|---|---|
| `audit.enabled` | `true` | Desligada, nada novo é auditado. Também nada novo chega ao PDF sem dispensa. |
| `audit.max_per_run` | `8` | Auditorias por rodada a cada 3h. Antes do PDF o limite é 25. |
| `audit.auto_correct` | `true` | Correção automática do texto da IA reprovado. |
| `synthesis.max_calls_per_run` | `12` | Chamadas de síntese por rodada. |
| `synthesis.similarity_threshold` | `0.4` | Similaridade para juntar o mesmo assunto em dias diferentes. |
| `ai.models.audit` / `.synthesis` | ultra → lightning / lightning → ultra | Modelos usados. |
| `ai.daily_call_budget` | 60 → **120** | Só sobe se ainda estava no valor original. |
| `review.auto` | `true` | O robô resolve a fila de revisão. |
| `review.max_reanalysis` | `1` | Novas análises que o robô pede por assunto antes de descartar. |
