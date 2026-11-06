import { RELEVANCE_RANK, type Relevance } from '../triage/classify.ts'

export type Block = 'estado' | 'nacional' | 'internacional'

export type Candidate = {
  id: string
  scope: 'estadual' | 'nacional' | 'internacional'
  state: string | null
  relevance: Relevance | null
  relevance_score: number | null
  verification_status: string | null
  needs_review: boolean
  best_reliability: number // maior confiabilidade entre as fontes do assunto
}

export type SelectionPolicy = {
  pilotStates: string[]
  perBlock: Record<Block, number>
  minRelevance: Relevance
  editionStatuses: string[]
  singleSourceMinReliability: number
}

/** Pode entrar numa edição? (relevância mínima + política de verificação + sem revisão pendente) */
export function eligible(c: Candidate, p: SelectionPolicy): boolean {
  if (c.needs_review || !c.relevance || !c.verification_status) return false
  if (RELEVANCE_RANK[c.relevance] < RELEVANCE_RANK[p.minRelevance]) return false
  if (!p.editionStatuses.includes(c.verification_status)) return false
  if (c.verification_status === 'nao_confirmada' && c.best_reliability < p.singleSourceMinReliability) return false
  return true
}

/**
 * Escolhe os assuntos que merecem análise da IA: os mais relevantes de cada bloco
 * (estado de cada UF piloto, nacional, internacional), intercalados por bloco para que,
 * se a cota acabar, nenhum bloco fique sem conteúdo.
 */
export function selectForAnalysis(cands: Candidate[], p: SelectionPolicy): { id: string; block: Block; state: string | null }[] {
  const ok = cands.filter((c) => eligible(c, p)).sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0))
  const queues: { block: Block; state: string | null; items: string[] }[] = [
    ...p.pilotStates.map((uf) => ({ block: 'estado' as const, state: uf, items: ok.filter((c) => c.scope === 'estadual' && c.state === uf).slice(0, p.perBlock.estado).map((c) => c.id) })),
    { block: 'nacional', state: null, items: ok.filter((c) => c.scope === 'nacional').slice(0, p.perBlock.nacional).map((c) => c.id) },
    { block: 'internacional', state: null, items: ok.filter((c) => c.scope === 'internacional').slice(0, p.perBlock.internacional).map((c) => c.id) },
  ]
  const out: { id: string; block: Block; state: string | null }[] = []
  const seen = new Set<string>()
  for (let i = 0; queues.some((q) => i < q.items.length); i++)
    for (const q of queues) {
      const id = q.items[i]
      if (id && !seen.has(id)) {
        seen.add(id)
        out.push({ id, block: q.block, state: q.state })
      }
    }
  return out
}
