import { createHash } from 'node:crypto'

export const PROMPT_VERSION = 'analise-v2' // v2: acentuação obrigatória e tradução de nomes de órgãos

export type AnalysisSource = {
  n: number // número da fonte no prompt ([1], [2]…)
  source: string
  official: boolean
  title: string
  url: string
  published_at: string | null
  text: string // resumo + início do texto (já em texto puro)
}

export type AnalysisInput = {
  block: 'estado' | 'nacional' | 'internacional'
  state: string | null
  category: string | null
  verification: { status: string; independent_sources: number; summary: string }
  sources: AnalysisSource[]
}

const MAX_SOURCE_CHARS = 1800
const MAX_SOURCES = 6

/** Monta a entrada a partir das matérias (fonte oficial e mais confiáveis primeiro), com tamanho limitado. */
export function buildInput(base: Omit<AnalysisInput, 'sources'>, sources: Omit<AnalysisSource, 'n'>[]): AnalysisInput {
  return {
    ...base,
    sources: sources.slice(0, MAX_SOURCES).map((s, i) => ({ ...s, n: i + 1, text: s.text.replace(/\s+/g, ' ').trim().slice(0, MAX_SOURCE_CHARS) })),
  }
}

/** Impressão digital da entrada: mesma entrada + mesma versão do prompt = reaproveita a análise, sem nova chamada. */
export function inputHash(input: AnalysisInput): string {
  return createHash('sha256').update(PROMPT_VERSION + '\n' + JSON.stringify(input)).digest('hex')
}

const BLOCK_LABEL = { estado: 'Estado (notícia do estado do assinante)', nacional: 'Nacional', internacional: 'Internacional' }

const SYSTEM = `Você é editor de um informativo de atualidades para candidatos a concursos públicos no Brasil.
Escreva em português do Brasil, linguagem clara, objetiva e didática, tom jornalístico neutro e apartidário.

REGRAS OBRIGATÓRIAS
1. Use SOMENTE as informações das FONTES fornecidas. Não invente fatos, números, datas, nomes, cargos, leis ou citações.
2. Todo número, percentual, valor ou data que você escrever deve constar nas fontes. Se não constar, não escreva.
3. Contexto/antecedentes: só conhecimento amplamente estabelecido e sem números novos; na dúvida, deixe "".
4. Projeções e consequências futuras vão em "projecoes" e devem ser apresentadas como possibilidades, nunca como fatos.
5. Não opine nem tome partido. Apresente posições divergentes, se houver nas fontes.
6. Fontes em inglês: escreva tudo em português, traduzindo também nomes de órgãos e cargos (General Assembly → Assembleia Geral; Security Council → Conselho de Segurança; Secretary-General → secretário-geral).
9. Use a ortografia oficial com acentuação completa (não, também, público, econômico, saúde…).
7. "referencias" contém apenas URLs das fontes fornecidas.
8. Responda APENAS com um objeto JSON válido, sem texto antes ou depois, sem markdown.`

const FORMAT = `FORMATO (JSON):
{
  "titulo_editorial": "título informativo, até 110 caracteres",
  "resumo": "2 a 3 frases com o essencial",
  "o_que_aconteceu": "1 parágrafo com os fatos (quem, o quê, quando, onde)",
  "contexto": "1 parágrafo de contexto, ou \\"\\"",
  "antecedentes": "1 parágrafo, ou \\"\\"",
  "analise_politica": "ou \\"\\" se não se aplica",
  "analise_economica": "ou \\"\\" se não se aplica",
  "impacto_social": "ou \\"\\" se não se aplica",
  "por_que_importa": "1 parágrafo",
  "consequencias": { "confirmadas": ["efeitos já confirmados nas fontes"], "projecoes": ["possíveis desdobramentos"] },
  "relevancia_para_concursos": "por que o tema pode cair em prova",
  "temas_de_prova": ["3 a 6 temas/disciplinas relacionadas"],
  "memorizar": ["3 a 6 fatos curtos e verificáveis nas fontes"],
  "abordagens_em_prova": ["2 a 4 formas como bancas podem cobrar"],
  "questoes": [
    { "enunciado": "questão de múltipla escolha baseada só nas fontes", "alternativas": { "A": "", "B": "", "C": "", "D": "", "E": "" }, "gabarito": "A", "comentario": "por que a alternativa correta está certa" }
  ],
  "referencias": ["URLs das fontes usadas"]
}
Gere exatamente 2 questões, com uma única alternativa correta cada.`

export function buildMessages(input: AnalysisInput) {
  const sources = input.sources
    .map((s) => `[${s.n}] ${s.source}${s.official ? ' (fonte oficial)' : ''}${s.published_at ? ` — ${s.published_at.slice(0, 10)}` : ''}\nTítulo: ${s.title}\nURL: ${s.url}\nTexto: ${s.text}`)
    .join('\n\n')
  const user = `BLOCO DO INFORMATIVO: ${BLOCK_LABEL[input.block]}${input.state ? ` — UF ${input.state}` : ''}
CATEGORIA: ${input.category ?? 'não definida'}
VERIFICAÇÃO: ${input.verification.status} (${input.verification.independent_sources} fonte(s) independente(s)). ${input.verification.summary}

FONTES:
${sources}

${FORMAT}`
  return [
    { role: 'system' as const, content: SYSTEM },
    { role: 'user' as const, content: user },
  ]
}
