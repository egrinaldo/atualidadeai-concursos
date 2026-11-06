/**
 * Modelo do documento da edição (independente do banco e do HTML).
 * A ordem dos blocos é fixa: Estado → Nacional → Internacional.
 */
export const TEMPLATE_VERSION = 'informativo-v1'

export type EditionType = 'diaria' | 'semanal' | 'mensal'
export type BlockKey = 'estado' | 'nacional' | 'internacional'

export type Reference = { source: string; title: string | null; url: string; official: boolean }
export type Question = { n: number; statement: string; alternatives: { letter: string; text: string }[]; answer: string; comment: string }

export type Item = {
  n: number // numeração contínua na edição
  title: string
  category: string
  verification: { label: string; tone: 'ok' | 'info' | 'warn' }
  sources: number
  summary: string
  whatHappened: string
  context: string | null
  background: string | null
  analyses: { label: string; text: string }[]
  whyItMatters: string
  consequences: { confirmed: string[]; projections: string[] }
  examRelevance: string
  topics: string[]
  memorize: string[]
  approaches: string[]
  questions: Question[]
  references: Reference[]
}

export type Block = { key: BlockKey; title: string; subtitle: string; items: Item[] }

export type EditionDoc = {
  type: EditionType
  state: string
  stateName: string
  referenceDate: string // AAAA-MM-DD (data de publicação)
  periodStart: string // ISO
  periodEnd: string // ISO
  blocks: Block[]
  templateVersion: string
}

export const STATE_NAMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo',
  GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
  PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
}

export const CATEGORY_LABELS: Record<string, string> = {
  politica_nacional: 'Política nacional', politica_internacional: 'Política internacional', economia: 'Economia', educacao: 'Educação',
  saude: 'Saúde', seguranca_publica: 'Segurança pública', meio_ambiente: 'Meio ambiente', tecnologia: 'Tecnologia', ciencia: 'Ciência',
  relacoes_internacionais: 'Relações internacionais', direitos_humanos: 'Direitos humanos', legislacao: 'Legislação',
  administracao_publica: 'Administração pública', sociedade: 'Sociedade', infraestrutura: 'Infraestrutura', cultura: 'Cultura',
  acontecimentos_regionais: 'Acontecimentos regionais',
}

export const EDITION_LABELS: Record<EditionType, string> = { diaria: 'Informativo Diário', semanal: 'Revisão Semanal', mensal: 'Revisão Mensal' }

/** Selo de verificação mostrado ao leitor (a política editorial está em docs/VERIFICACAO_INFORMACOES.md). */
export function verificationBadge(status: string | null, sources: number, hasOfficial: boolean): Item['verification'] {
  if (status === 'corroborada') return { label: `Confirmada por ${sources} fontes independentes`, tone: 'ok' }
  if (status === 'parcialmente_corroborada') return hasOfficial ? { label: 'Fonte oficial', tone: 'ok' } : { label: 'Confirmação parcial', tone: 'info' }
  if (status === 'nao_confirmada') return { label: 'Fonte única — sem confirmação independente', tone: 'warn' }
  return { label: 'Em verificação', tone: 'warn' }
}

/** Linha de banco (assunto + análise válida + matérias) → item do documento. */
export type SourceRow = {
  category: string | null
  verification_status: string | null
  source_count: number
  editorial_title: string
  summary: string
  what_happened: string
  context: string | null
  historical_background: string | null
  political_analysis: string | null
  economic_analysis: string | null
  social_impact: string | null
  why_it_matters: string
  consequences: { confirmados?: string[]; projecoes?: string[] } | null
  relevance_for_exams: string
  possible_exam_topics: string[]
  memorize: string[]
  exam_approaches: string[]
  questions: { enunciado: string; alternativas: Record<string, string>; gabarito: string; comentario: string }[]
  refs: { url: string; source: string | null; title: string | null; official: boolean }[]
}

const isHttp = (u: string) => /^https?:\/\//i.test(u)

export function toItem(r: SourceRow, n: number, questionStart: number): Item {
  const refs = (r.refs ?? []).filter((x) => x && isHttp(x.url))
  const seen = new Set<string>()
  const references = refs.filter((x) => !seen.has(x.url) && seen.add(x.url)).map((x) => ({ source: x.source ?? new URL(x.url).hostname, title: x.title, url: x.url, official: !!x.official }))
  const analyses = [
    { label: 'Análise política', text: r.political_analysis },
    { label: 'Análise econômica', text: r.economic_analysis },
    { label: 'Impacto social', text: r.social_impact },
  ].filter((a): a is { label: string; text: string } => !!a.text && a.text.trim().length > 0)
  return {
    n,
    title: r.editorial_title,
    category: CATEGORY_LABELS[r.category ?? ''] ?? 'Atualidades',
    verification: verificationBadge(r.verification_status, r.source_count, references.some((x) => x.official)),
    sources: r.source_count,
    summary: r.summary,
    whatHappened: r.what_happened,
    context: r.context?.trim() || null,
    background: r.historical_background?.trim() || null,
    analyses,
    whyItMatters: r.why_it_matters,
    consequences: { confirmed: r.consequences?.confirmados ?? [], projections: r.consequences?.projecoes ?? [] },
    examRelevance: r.relevance_for_exams,
    topics: r.possible_exam_topics ?? [],
    memorize: r.memorize ?? [],
    approaches: r.exam_approaches ?? [],
    questions: (r.questions ?? []).map((q, i) => ({
      n: questionStart + i,
      statement: q.enunciado,
      alternatives: Object.entries(q.alternativas).sort(([a], [b]) => a.localeCompare(b)).map(([letter, text]) => ({ letter, text })),
      answer: q.gabarito,
      comment: q.comentario,
    })),
    references,
  }
}

/** Monta o documento a partir das linhas já ordenadas por bloco. */
export function buildDoc(meta: Omit<EditionDoc, 'blocks' | 'templateVersion' | 'stateName'>, byBlock: Record<BlockKey, SourceRow[]>): EditionDoc {
  const stateName = STATE_NAMES[meta.state] ?? meta.state
  const defs: { key: BlockKey; title: string; subtitle: string }[] = [
    { key: 'estado', title: stateName, subtitle: `O que aconteceu no ${stateName === 'Distrito Federal' ? 'DF' : 'estado'} e pode cair em prova` },
    { key: 'nacional', title: 'Brasil', subtitle: 'Política, economia, leis e decisões de alcance nacional' },
    { key: 'internacional', title: 'Mundo', subtitle: 'Fatos internacionais e relações exteriores' },
  ]
  let n = 1
  let q = 1
  const blocks = defs.map((d) => ({
    ...d,
    items: (byBlock[d.key] ?? []).map((r) => {
      const item = toItem(r, n++, q)
      q += item.questions.length
      return item
    }),
  }))
  return { ...meta, stateName, blocks, templateVersion: TEMPLATE_VERSION }
}
