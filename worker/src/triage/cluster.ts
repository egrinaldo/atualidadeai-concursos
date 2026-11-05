import { RELEVANCE_RANK, relevanceOf, type Relevance, type Scope } from './classify.ts'
import { cosine, documentFrequency, tokens, vectorize, type Vector } from './text.ts'

export type ClusterDoc = {
  id: string
  title: string
  excerpt: string | null
  language: string
  at: number // published_at (ou collected_at) em ms
  cluster_id: string | null
}

export type ClusterOptions = { threshold: number; windowHours: number; newId: () => string }

/**
 * Agrupa notícias sobre o mesmo fato (TF-IDF + cosseno, ligação simples com qualquer membro):
 * cada candidata entra no assunto do membro mais parecido (mesmo idioma, dentro da janela de tempo)
 * se a similaridade passar do limiar; senão abre um assunto novo.
 * `corpus` define o IDF (notícias recentes) — palavras comuns pesam menos.
 */
export function assignClusters(candidates: ClusterDoc[], members: ClusterDoc[], corpus: { title: string; excerpt: string | null }[], opts: ClusterOptions) {
  const docs = corpus.map((d) => [...tokens(d.title), ...tokens(d.excerpt ?? '').slice(0, 60)])
  const df = documentFrequency(docs)
  const n = docs.length
  const vec = new Map<string, Vector>()
  const v = (d: ClusterDoc) => {
    let x = vec.get(d.id)
    if (!x) {
      x = vectorize(d.title, d.excerpt ?? '', df, n)
      vec.set(d.id, x)
    }
    return x
  }

  const pool = members.filter((m) => m.cluster_id)
  const assignment = new Map<string, { cluster_id: string; similarity: number; is_new: boolean }>()
  const windowMs = opts.windowHours * 3_600_000

  for (const c of [...candidates].sort((a, b) => a.at - b.at)) {
    let best: ClusterDoc | null = null
    let bestSim = 0
    for (const m of pool) {
      if (m.language !== c.language || Math.abs(m.at - c.at) > windowMs) continue
      const s = cosine(v(c), v(m))
      if (s > bestSim) {
        bestSim = s
        best = m
      }
    }
    if (best && bestSim >= opts.threshold) {
      assignment.set(c.id, { cluster_id: best.cluster_id!, similarity: Number(bestSim.toFixed(3)), is_new: false })
      pool.push({ ...c, cluster_id: best.cluster_id })
    } else {
      const id = opts.newId()
      assignment.set(c.id, { cluster_id: id, similarity: 1, is_new: true })
      pool.push({ ...c, cluster_id: id })
    }
  }
  return assignment
}

export type Member = {
  id: string
  title: string
  scope: Scope
  state: string | null
  category: string | null
  relevance_score: number | null
  at: number
  source_key: string // grupo editorial (ou a própria fonte, se sem grupo)
  reliability_level: number
  is_primary: boolean
}

const SCOPE_PRIORITY: Record<Scope, number> = { estadual: 3, nacional: 2, internacional: 1 }

function mostCommon<T>(values: T[], tieBreak: (a: T, b: T) => number): T {
  const counts = new Map<T, number>()
  for (const x of values) counts.set(x, (counts.get(x) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || tieBreak(a[0], b[0]))[0][0]
}

/**
 * Dados do assunto a partir dos membros: título da matéria mais relevante (desempate: fonte oficial/confiável), alcance e categoria
 * da maioria, relevância = maior nota + bônus por fontes independentes (até +15).
 */
export function aggregateCluster(members: Member[]) {
  const lead = [...members].sort(
    (a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0) || Number(b.is_primary) - Number(a.is_primary) || b.reliability_level - a.reliability_level || a.at - b.at,
  )[0]
  // Empate: vence o alcance da matéria mais relevante
  const bestOf = (sc: Scope) => Math.max(...members.filter((m) => m.scope === sc).map((m) => m.relevance_score ?? 0))
  let scope = mostCommon(members.map((m) => m.scope), (a, b) => bestOf(b) - bestOf(a) || SCOPE_PRIORITY[b] - SCOPE_PRIORITY[a])
  const ufs = members.filter((m) => m.scope === 'estadual' && m.state).map((m) => m.state!)
  // Mesmo fato em estados diferentes = pauta nacional
  const state = scope === 'estadual' && new Set(ufs).size === 1 ? ufs[0] : null
  if (scope === 'estadual' && !state) scope = 'nacional'
  const category = mostCommon(members.map((m) => m.category ?? 'sociedade'), (a, b) => a.localeCompare(b))
  const independent = new Set(members.map((m) => m.source_key)).size
  const top = Math.max(...members.map((m) => m.relevance_score ?? 0))
  const bonus = Math.min(15, 5 * (independent - 1))
  const score = Math.min(100, top + bonus)
  const relevance: Relevance = relevanceOf(score)
  return {
    title: lead.title.slice(0, 300),
    scope,
    state,
    category,
    relevance,
    relevance_score: score,
    source_count: independent,
    article_count: members.length,
    first_seen_at: new Date(Math.min(...members.map((m) => m.at))).toISOString(),
    last_seen_at: new Date(Math.max(...members.map((m) => m.at))).toISOString(),
    relevance_reasons: {
      maior_nota_individual: top,
      fontes_independentes: independent,
      bonus_fontes: bonus,
      noticia_referencia: lead.id,
    },
  }
}

export { RELEVANCE_RANK }
