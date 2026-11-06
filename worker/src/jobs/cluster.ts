import { randomUUID } from 'node:crypto'
import type { Scope } from '../triage/classify.ts'
import { aggregateCluster, assignClusters, type ClusterDoc, type Member } from '../triage/cluster.ts'
import { selectAll } from '../db/paginate.ts'
import { pool } from './triage.ts'
import type { JobContext } from './types.ts'

export const CLUSTER_DEFAULTS = { threshold: 0.38, windowHours: 72, batch: 1000, maxPasses: 4 }
/** Assuntos que ainda aceitam novas matérias. */
const JOINABLE = ['open', 'verifying', 'verified', 'analyzing', 'analyzed', 'approved']

async function setting<T>(ctx: JobContext, key: string, fallback: T): Promise<T> {
  const { data } = await ctx.db.from('app_settings').select('value').eq('key', key).maybeSingle()
  return (data?.value as T | undefined) ?? fallback
}

type NewsRow = {
  id: string
  title: string
  excerpt: string | null
  language: string
  scope: Scope
  state: string | null
  category: string | null
  relevance_score: number | null
  published_at: string | null
  collected_at: string
  cluster_id: string | null
  source_id: string
  news_sources: { group_id: string | null; reliability_level: number; is_primary: boolean }
}
const COLS = 'id, title, excerpt, language, scope, state, category, relevance_score, published_at, collected_at, cluster_id, source_id, news_sources!inner(group_id, reliability_level, is_primary)'
const at = (r: NewsRow) => new Date(r.published_at ?? r.collected_at).getTime()
const toDoc = (r: NewsRow): ClusterDoc => ({ id: r.id, title: r.title, excerpt: r.excerpt, language: r.language, at: at(r), cluster_id: r.cluster_id })
const toMember = (r: NewsRow): Member => ({
  id: r.id, title: r.title, scope: r.scope, state: r.state, category: r.category, relevance_score: r.relevance_score, at: at(r),
  source_key: r.news_sources.group_id ?? r.source_id, reliability_level: r.news_sources.reliability_level, is_primary: r.news_sources.is_primary,
})

/**
 * Agrupamento: junta as notícias triadas sobre o mesmo fato em assuntos (news_clusters) e recalcula
 * título, alcance, categoria e relevância de cada assunto afetado. Determinístico — não usa IA.
 */
export async function clusterJob(job: { payload: Record<string, unknown> }, ctx: JobContext) {
  // Volume alto (veículos de imprensa): processa em passadas de até 1.000 candidatas
  const total = { candidates: 0, new_clusters: 0, joined: 0, passes: 0, more_pending: false }
  let last: Record<string, unknown> = {}
  for (let pass = 0; pass < CLUSTER_DEFAULTS.maxPasses; pass++) {
    const r = await clusterPass(job, ctx)
    last = r
    total.passes++
    total.candidates += Number(r.candidates ?? 0)
    total.new_clusters += Number(r.new_clusters ?? 0)
    total.joined += Number(r.joined ?? 0)
    total.more_pending = Boolean(r.more_pending)
    if (!r.more_pending) break
  }
  return { ...last, ...total }
}

async function clusterPass(_job: { payload: Record<string, unknown> }, ctx: JobContext) {
  const threshold = Number(await setting(ctx, 'triage.similarity_threshold', CLUSTER_DEFAULTS.threshold))
  const windowHours = Number(await setting(ctx, 'triage.cluster_window_hours', CLUSTER_DEFAULTS.windowHours))

  const { data: cand, error: e1 } = await ctx.db.from('news').select(COLS).eq('status', 'triaged').order('collected_at').limit(CLUSTER_DEFAULTS.batch)
  if (e1) throw new Error(`candidatas: ${e1.message}`)
  const candidates = (cand ?? []) as unknown as NewsRow[]
  if (!candidates.length) return { candidates: 0, new_clusters: 0, joined: 0 }

  // Membros de assuntos recentes que ainda aceitam matérias + corpus da semana para o IDF
  const since = new Date(Math.min(...candidates.map(at)) - windowHours * 3_600_000).toISOString()
  const members = (await selectAll((from, to) =>
    ctx.db.from('news').select(`${COLS}, news_clusters!inner(status)`).eq('status', 'clustered').in('news_clusters.status', JOINABLE).gte('collected_at', since).order('id').range(from, to),
  ).catch((e) => { throw new Error(`membros: ${e.message}`) })) as unknown as NewsRow[]
  const corpusRows = await selectAll<{ title: string; excerpt: string | null }>((from, to) =>
    ctx.db.from('news').select('title, excerpt').neq('status', 'discarded').gte('collected_at', new Date(Date.now() - 7 * 86_400_000).toISOString()).order('id').range(from, to),
  ).catch((e) => { throw new Error(`corpus: ${e.message}`) })

  const assignment = assignClusters(candidates.map(toDoc), members.map(toDoc), corpusRows, { threshold, windowHours, newId: randomUUID })

  // Assuntos novos: criados com dados provisórios (o recálculo abaixo define os definitivos)
  const byCluster = new Map<string, NewsRow[]>()
  for (const m of members) byCluster.set(m.cluster_id!, [...(byCluster.get(m.cluster_id!) ?? []), m])
  for (const c of candidates) {
    const a = assignment.get(c.id)!
    byCluster.set(a.cluster_id, [...(byCluster.get(a.cluster_id) ?? []), { ...c, cluster_id: a.cluster_id }])
  }
  const touched = new Set([...assignment.values()].map((a) => a.cluster_id))
  const created = [...new Set([...assignment.values()].filter((a) => a.is_new).map((a) => a.cluster_id))]
  const now = new Date().toISOString()

  const newRows = created.map((id) => ({ id, ...aggregateCluster(byCluster.get(id)!.map(toMember)), status: 'open', members_changed_at: now, created_at: now, updated_at: now }))
  for (let i = 0; i < newRows.length; i += 200) {
    const { error } = await ctx.db.from('news_clusters').insert(newRows.slice(i, i + 200))
    if (error) throw new Error(`criar assuntos: ${error.message}`)
  }

  let failed = 0
  await pool(candidates, 8, async (c) => {
    const { error } = await ctx.db.from('news').update({ cluster_id: assignment.get(c.id)!.cluster_id, status: 'clustered' }).eq('id', c.id).eq('status', 'triaged')
    if (error) failed++
  })
  // Assuntos já existentes que ganharam matérias: recalcula agregados
  const existing = [...touched].filter((id) => !created.includes(id))
  await pool(existing, 8, async (id) => {
    // members_changed_at sinaliza para a verificação (2.4) que o assunto precisa ser verificado de novo
    const { error } = await ctx.db.from('news_clusters').update({ ...aggregateCluster(byCluster.get(id)!.map(toMember)), members_changed_at: now, updated_at: now }).eq('id', id)
    if (error) failed++
    // Assunto já verificado/analisado que ganhou matéria volta para a fila (verificação e, depois, nova análise)
    const { error: e2 } = await ctx.db.from('news_clusters').update({ status: 'open' }).eq('id', id).in('status', ['verified', 'analyzed'])
    if (e2) failed++
  })
  if (failed) throw new Error(`agrupamento: ${failed} gravações falharam`)

  const sizes = [...touched].map((id) => byCluster.get(id)!.length)
  return {
    candidates: candidates.length,
    new_clusters: created.length,
    joined: candidates.filter((c) => !assignment.get(c.id)!.is_new).length,
    multi_article_clusters: sizes.filter((n) => n > 1).length,
    largest_cluster: Math.max(...sizes),
    threshold,
    more_pending: candidates.length === CLUSTER_DEFAULTS.batch,
  }
}
