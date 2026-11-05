import type { Relevance } from '../triage/classify.ts'
import { VERIFIER, verifyCluster, type VerifyMember } from '../verify/verify.ts'
import { pool } from './triage.ts'
import type { JobContext } from './types.ts'

export const VERIFY_LIMITS = { lookbackDays: 7, batch: 400 }

type ClusterRow = { id: string; relevance: Relevance | null; verified_at: string | null; members_changed_at: string }
type NewsRow = {
  id: string
  cluster_id: string
  title: string
  excerpt: string | null
  original_content: string | null
  original_url: string
  language: string
  source_id: string
  news_sources: { name: string; group_id: string | null; is_primary: boolean; reliability_level: number }
}

/** Assunto precisa de (nova) verificação: nunca verificado ou ganhou matérias depois da última verificação. */
export const isStale = (c: Pick<ClusterRow, 'verified_at' | 'members_changed_at'>) => !c.verified_at || new Date(c.verified_at) < new Date(c.members_changed_at)

/**
 * Verificação: para cada assunto novo ou alterado, cruza as fontes do próprio banco e grava o resultado
 * (histórico em news_verifications + resumo no assunto). Determinística — não usa IA.
 */
export async function verifyJob(_job: { payload: Record<string, unknown> }, ctx: JobContext) {
  const since = new Date(Date.now() - VERIFY_LIMITS.lookbackDays * 86_400_000).toISOString()
  const { data, error } = await ctx.db
    .from('news_clusters')
    .select('id, relevance, verified_at, members_changed_at')
    .in('status', ['open', 'verified'])
    .gte('last_seen_at', since)
    .order('relevance_score', { ascending: false, nullsFirst: false })
    .limit(5000)
  if (error) throw new Error(`assuntos: ${error.message}`)
  const clusters = ((data ?? []) as ClusterRow[]).filter(isStale).slice(0, VERIFY_LIMITS.batch)
  if (!clusters.length) return { verified: 0 }

  const members = new Map<string, VerifyMember[]>()
  for (let i = 0; i < clusters.length; i += 100) {
    const ids = clusters.slice(i, i + 100).map((c) => c.id)
    const { data: rows, error: e } = await ctx.db
      .from('news')
      .select('id, cluster_id, title, excerpt, original_content, original_url, language, source_id, news_sources!inner(name, group_id, is_primary, reliability_level)')
      .in('cluster_id', ids)
      .eq('status', 'clustered')
    if (e) throw new Error(`matérias: ${e.message}`)
    for (const r of (rows ?? []) as unknown as NewsRow[]) {
      const m: VerifyMember = {
        id: r.id, title: r.title, excerpt: r.excerpt, content: r.original_content, url: r.original_url, language: r.language,
        source_name: r.news_sources.name, group_key: r.news_sources.group_id ?? r.source_id,
        is_primary: r.news_sources.is_primary, reliability_level: r.news_sources.reliability_level,
      }
      members.set(r.cluster_id, [...(members.get(r.cluster_id) ?? []), m])
    }
  }

  const { data: setting } = await ctx.db.from('app_settings').select('value').eq('key', 'verification.single_source_min_reliability').maybeSingle()
  const opts = { singleSourceMinReliability: Number(setting?.value ?? 4) }
  const counts: Record<string, number> = {}
  let review = 0
  let failed = 0
  await pool(clusters, 6, async (c) => {
    const ms = members.get(c.id)
    if (!ms?.length) return // assunto sem matérias (ex.: todas descartadas depois) fica para a limpeza
    const v = verifyCluster(ms, c.relevance, opts)
    const now = new Date().toISOString()
    const { error: e1 } = await ctx.db.from('news_verifications').insert({ cluster_id: c.id, ...v, ...VERIFIER, verified_at: now })
    // Condição em members_changed_at: se o assunto mudou durante a verificação, fica pendente para a próxima rodada
    const { error: e2 } = e1
      ? { error: e1 }
      : await ctx.db
          .from('news_clusters')
          .update({ status: 'verified', verification_status: v.verification_status, verification_confidence: v.confidence_level, needs_review: v.needs_human_review, verified_at: now })
          .eq('id', c.id)
          .eq('members_changed_at', c.members_changed_at)
    if (e1 || e2) {
      failed++
      ctx.log.warn('verificação: falha ao gravar', { cluster: c.id, error: (e1 ?? e2)!.message })
      return
    }
    counts[v.verification_status] = (counts[v.verification_status] ?? 0) + 1
    if (v.needs_human_review) review++
  })
  if (failed) throw new Error(`verificação: ${failed} gravações falharam`)
  return { verified: clusters.length, ...counts, needs_review: review }
}
