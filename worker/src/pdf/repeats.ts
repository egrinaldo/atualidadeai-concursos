import { cosine, documentFrequency, fold, tokens, vectorize, type Vector } from '../triage/text.ts'

/**
 * Evita repetir na diária o que já saiu em diárias anteriores (regra revista em 08/11/2026).
 *
 * "Mesmo assunto" = mesmo agrupamento (cluster) OU outro agrupamento ligado ao mesmo fato:
 *   - texto quase igual (similaridade ≥ `similarity`), ou
 *   - mesmos nomes próprios distintivos (ex.: "Santiago Peña" + "Paraguai"), que ligam o desdobramento ao
 *     fato original mesmo com palavras diferentes (renúncia × prisão do mesmo presidente).
 *
 * Um assunto já publicado só volta como "Atualização" se houver FATO NOVO de verdade:
 *   1. matérias novas depois do fim do período da edição anterior;
 *   2. texto (análise) diferente do publicado; e
 *   3. a MANCHETE mudou (o fato principal é outro). Título reescrito com o mesmo fato ("MP do Paraguai
 *      determina prisão…" → "Justiça do Paraguai determina prisão…") é repetição.
 * Assunto de outro agrupamento que começou ANTES da publicação anterior é bastidor/antecedente, não novidade.
 *
 * Dentro da mesma edição, dois candidatos do mesmo assunto viram um só (`dedupeSameStory`).
 */
export type Published = { clusterId: string; analysisId: string; referenceDate: string; periodEnd: string; title: string; summary: string }
export type RepeatCandidate = { id: string; analysis_id: string; last_seen_at: string; first_seen_at?: string | null; title: string; summary: string }
export type RepeatDecision = { keep: true; updateOf: string | null } | { keep: false; reason: string }
export type RepeatOptions = { similarity?: number; similarDays?: number; headlineSimilarity?: number }

// ---------------------------------------------------------------------------------------------------------
// Nomes próprios

/** Palavras que aparecem com maiúscula só por abrir frase/título, ou genéricas demais para ligar assuntos. */
const NOT_ENTITY = new Set(
  ('o a os as um uma em no na nos nas de do da dos das e com sem para por pelo pela apos antes durante entre sob sobre ate ' +
    'nesta neste nesse nessa hoje ontem segundo conforme como quando onde mais menos novo nova novos novas primeiro primeira ' +
    'presidente governo ministro ministra ministerio deputado deputada senador senadora prefeito prefeita juiz justica policia ' +
    'tribunal camara senado congresso estado estados pais brasil brasileiro brasileira federal nacional internacional mundo ' +
    'janeiro fevereiro marco abril maio junho julho agosto setembro outubro novembro dezembro ' +
    'segunda terca quarta quinta sexta sabado domingo projeto lei proposta operacao programa plano').split(' '),
)
/** Instituições citadas em assuntos muito diferentes: não ligam um assunto a outro sozinhas. */
const GENERIC_ENTITIES = new Set([
  'camara dos deputados', 'senado federal', 'supremo tribunal federal', 'stf', 'stj', 'tse', 'tcu', 'congresso nacional', 'governo federal',
  'banco central', 'ministerio publico', 'policia federal', 'policia civil', 'policia militar', 'receita federal', 'ibge', 'onu', 'nacoes unidas',
  'estados unidos', 'eua', 'uniao europeia', 'casa branca', 'planalto', 'palacio do planalto', 'lula', 'luiz inacio lula da silva', 'sus', 'enem', 'inss',
  'ceara', 'fortaleza', 'bahia', 'salvador', 'sao paulo', 'rio de janeiro', 'brasilia',
])

/** Nome que começa por um tipo de órgão ("Prefeitura de Fortaleza", "Ministério Público do Ceará") é a fonte ou
 *  o órgão que aparece em muitos assuntos diferentes: não liga assuntos (as partes, como "Paraguai", ainda contam). */
const INSTITUTION_HEADS = new Set(
  ('prefeitura governo secretaria assembleia tribunal ministerio camara policia universidade defensoria procuradoria conselho ' +
    'agencia instituto comite comissao fundacao departamento superintendencia coordenadoria controladoria receita justica ' +
    'publico publica orgao autarquia empresa companhia escola hospital').split(' '),
)
const CONNECTORS = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'del', 'la', 'von', 'van'])
const UPPER ='A-ZÁÉÍÓÚÂÊÔÃÕÀÇ'
const ENTITY_RE = new RegExp(`[${UPPER}][\\p{L}'’-]+(?:\\s+(?:de|da|do|dos|das|e|del|la|von|van)?\\s*[${UPPER}][\\p{L}'’-]+)*|\\b[${UPPER}]{2,6}\\b`, 'gu')

/** Nomes próprios (pessoas, lugares, organizações, siglas), normalizados e sem os genéricos de abertura de frase. */
export function entities(text: string): Set<string> {
  const out = new Set<string>()
  const add = (raw: string) => {
    let words = raw.split(/\s+/).filter(Boolean)
    if (INSTITUTION_HEADS.has(words.find((w) => !NOT_ENTITY.has(w)) ?? '')) return
    // tira palavras genéricas e conectivos das pontas ("Presidente Santiago Peña" → "santiago pena")
    const trim = (w: string) => NOT_ENTITY.has(w) || CONNECTORS.has(w)
    while (words.length && trim(words[0])) words = words.slice(1)
    while (words.length && trim(words[words.length - 1])) words = words.slice(0, -1)
    if (!words.length) return
    const e = words.join(' ')
    if (e.length < 2 || (words.length === 1 && NOT_ENTITY.has(e))) return
    out.add(e)
  }
  for (const m of text.matchAll(ENTITY_RE)) {
    // Siglas (MPCE, TCE, ONU…) quase sempre são órgãos/fontes citados em assuntos diferentes: não ligam assuntos
    if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÀÇ][A-ZÁÉÍÓÚÂÊÔÃÕÀÇ0-9-]{1,9}$/.test(m[0])) continue
    // "Ministério Público e Justiça do Paraguai" = dois nomes; "MP do Paraguai" também vale como "Paraguai"
    for (const part of fold(m[0]).split(/\s+e\s+/)) {
      add(part)
      const pieces = part.split(/\s+(?:de|da|do|dos|das|del|la)\s+/)
      if (pieces.length > 1) for (const p of pieces) add(p)
    }
  }
  return out
}

type Doc = { key: string; title: string; summary: string; ents: Set<string>; vec?: Vector }

/** Liga dois textos ao mesmo assunto: texto quase igual, ou nomes próprios distintivos em comum. */
function linker(docs: Doc[], similarity: number) {
  const df = documentFrequency(docs.map((d) => tokens(`${d.title} ${d.summary}`)))
  const n = docs.length || 1
  for (const d of docs) d.vec = vectorize(d.title, d.summary, df, n)
  const edf = new Map<string, number>()
  for (const d of docs) for (const e of d.ents) edf.set(e, (edf.get(e) ?? 0) + 1)
  // distintivo: não é genérico e não aparece em boa parte dos textos do período. O teto é largo de propósito:
  // assunto muito noticiado repete o nome em vários textos ("Santiago Peña" em 5 de 40) e continua distintivo
  const maxDf = Math.max(6, Math.ceil(n * 0.25))
  const distinctive = (e: string) => !GENERIC_ENTITIES.has(e) && (edf.get(e) ?? 0) <= maxDf
  return (a: Doc, b: Doc): boolean => {
    const cos = cosine(a.vec!, b.vec!)
    if (cos >= similarity) return true
    const shared = [...a.ents].filter((e) => b.ents.has(e) && distinctive(e))
    const multiword = shared.filter((e) => e.includes(' '))
    return (multiword.length >= 1 && (shared.length >= 2 || cos >= 0.25)) || shared.length >= 3
  }
}

/** Semelhança de manchetes (Jaccard de radicais): ≥ 0,6 = o mesmo fato principal reescrito. */
export function headlineSimilarity(a: string, b: string): number {
  const x = new Set(tokens(a))
  const y = new Set(tokens(b))
  if (!x.size || !y.size) return 0
  let inter = 0
  for (const t of x) if (y.has(t)) inter++
  return inter / (x.size + y.size - inter)
}

export function repeatDecisions<C extends RepeatCandidate>(cands: C[], published: Published[], referenceDate: string, opts: RepeatOptions = {}): Map<string, RepeatDecision> {
  const similarity = opts.similarity ?? 0.6
  const similarDays = opts.similarDays ?? 5
  const headline = opts.headlineSimilarity ?? 0.6
  const out = new Map<string, RepeatDecision>()
  const prior = published.filter((p) => p.referenceDate < referenceDate)
  const byCluster = new Map<string, Published[]>()
  for (const p of prior) byCluster.set(p.clusterId, [...(byCluster.get(p.clusterId) ?? []), p])
  const recentLimit = new Date(Date.parse(`${referenceDate}T12:00:00Z`) - similarDays * 86_400_000).toISOString().slice(0, 10)
  const recent = prior.filter((p) => p.referenceDate >= recentLimit)

  const cdocs = cands.map((c) => ({ key: c.analysis_id, title: c.title, summary: c.summary, ents: entities(`${c.title}. ${c.summary}`) }))
  const pdocs = recent.map((p) => ({ key: p.analysisId, title: p.title, summary: p.summary, ents: entities(`${p.title}. ${p.summary}`), p }))
  const linked = linker([...cdocs, ...pdocs], similarity)

  /** Fato novo frente às publicações anteriores do assunto: manchete diferente de TODAS elas. */
  const newHeadline = (title: string, prev: Published[]) => prev.every((p) => headlineSimilarity(title, p.title) < headline)

  cands.forEach((c, i) => {
    const latest = (ps: Published[]) => ps.reduce((a, b) => (b.referenceDate > a.referenceDate ? b : a))
    // 1. Mesmo agrupamento já publicado
    const same = byCluster.get(c.id)
    if (same?.length) {
      const prev = latest(same)
      if (Date.parse(c.last_seen_at) <= Date.parse(prev.periodEnd) || same.some((p) => p.analysisId === c.analysis_id))
        return out.set(c.analysis_id, { keep: false, reason: `já publicado em ${prev.referenceDate} sem fato novo` })
      if (!newHeadline(c.title, same))
        return out.set(c.analysis_id, { keep: false, reason: `já publicado em ${prev.referenceDate}: mesma manchete, sem fato principal novo` })
      return out.set(c.analysis_id, { keep: true, updateOf: prev.referenceDate })
    }
    // 2. Outro agrupamento, mesmo assunto
    const twins = pdocs.filter((d) => d.p.clusterId !== c.id && linked(cdocs[i], d)).map((d) => d.p)
    if (!twins.length) return out.set(c.analysis_id, { keep: true, updateOf: null })
    const prev = latest(twins)
    const startedBefore = c.first_seen_at ? Date.parse(c.first_seen_at) <= Date.parse(prev.periodEnd) : true
    if (startedBefore || !newHeadline(c.title, twins))
      return out.set(c.analysis_id, { keep: false, reason: `mesmo assunto de "${prev.title.slice(0, 60)}" (${prev.referenceDate})` })
    return out.set(c.analysis_id, { keep: true, updateOf: prev.referenceDate })
  })
  return out
}

/**
 * Na mesma edição, um assunto aparece uma vez só: entre candidatos ligados ao mesmo fato, fica o de maior
 * relevância (desempate: o mais recente). Devolve os ids descartados com o motivo.
 */
export function dedupeSameStory<C extends RepeatCandidate & { relevance_score?: number | null }>(cands: C[], opts: { similarity?: number } = {}): Map<string, string> {
  const docs = cands.map((c) => ({ key: c.analysis_id, title: c.title, summary: c.summary, ents: entities(`${c.title}. ${c.summary}`), c }))
  const linked = linker(docs, opts.similarity ?? 0.6)
  const order = [...docs].sort((a, b) => (b.c.relevance_score ?? 0) - (a.c.relevance_score ?? 0) || b.c.last_seen_at.localeCompare(a.c.last_seen_at))
  const kept: typeof docs = []
  const dropped = new Map<string, string>()
  for (const d of order) {
    const twin = kept.find((k) => linked(d, k))
    if (twin) dropped.set(d.key, `mesmo assunto de "${twin.title.slice(0, 60)}" (nesta edição)`)
    else kept.push(d)
  }
  return dropped
}

