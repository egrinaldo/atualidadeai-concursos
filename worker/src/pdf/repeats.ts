import { cosine, documentFrequency, tokens, vectorize } from '../triage/text.ts'

/**
 * Evita repetir na diária o que já saiu em diárias anteriores.
 * - Mesmo assunto (cluster) já publicado: só volta se houve FATO NOVO — matérias novas depois do fim do
 *   período daquela edição E um texto (análise) diferente do publicado. Volta marcado como "Atualização".
 * - Assunto diferente, mas com título/resumo quase igual a um já publicado nos últimos dias (o mesmo fato
 *   agrupado em outro cluster): fica de fora.
 */
export type Published = { clusterId: string; analysisId: string; referenceDate: string; periodEnd: string; title: string; summary: string }
export type RepeatCandidate = { id: string; analysis_id: string; last_seen_at: string; title: string; summary: string }
export type RepeatDecision = { keep: true; updateOf: string | null } | { keep: false; reason: string }

export function repeatDecisions<C extends RepeatCandidate>(cands: C[], published: Published[], referenceDate: string, opts: { similarity?: number; similarDays?: number } = {}): Map<string, RepeatDecision> {
  const threshold = opts.similarity ?? 0.6
  const similarDays = opts.similarDays ?? 3
  const out = new Map<string, RepeatDecision>()
  const prior = published.filter((p) => p.referenceDate < referenceDate)
  const byCluster = new Map<string, Published>()
  for (const p of prior) {
    const cur = byCluster.get(p.clusterId)
    if (!cur || p.referenceDate > cur.referenceDate) byCluster.set(p.clusterId, p) // a publicação mais recente
  }
  const recentLimit = new Date(Date.parse(`${referenceDate}T12:00:00Z`) - similarDays * 86_400_000).toISOString().slice(0, 10)
  const recent = prior.filter((p) => p.referenceDate >= recentLimit)
  const docs = [...cands.map((c) => tokens(`${c.title} ${c.summary}`)), ...recent.map((p) => tokens(`${p.title} ${p.summary}`))]
  const df = documentFrequency(docs)
  const n = docs.length || 1
  const recentVecs = recent.map((p) => ({ p, v: vectorize(p.title, p.summary, df, n) }))

  for (const c of cands) {
    const prev = byCluster.get(c.id)
    if (prev) {
      const newFacts = Date.parse(c.last_seen_at) > Date.parse(prev.periodEnd) && c.analysis_id !== prev.analysisId
      out.set(c.analysis_id, newFacts ? { keep: true, updateOf: prev.referenceDate } : { keep: false, reason: `já publicado em ${prev.referenceDate} sem fato novo` })
      continue
    }
    const v = vectorize(c.title, c.summary, df, n)
    const twin = recentVecs.find((r) => r.p.clusterId !== c.id && cosine(v, r.v) >= threshold)
    out.set(c.analysis_id, twin ? { keep: false, reason: `mesmo fato de "${twin.p.title.slice(0, 60)}" (${twin.p.referenceDate})` } : { keep: true, updateOf: null })
  }
  return out
}
