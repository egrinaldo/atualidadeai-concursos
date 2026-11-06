import type { JobContext } from '../jobs/types.ts'
import { buildInput, type AnalysisInput } from './prompt.ts'

type Member = {
  title: string
  excerpt: string | null
  original_content: string | null
  original_url: string
  published_at: string | null
  news_sources: { name: string; is_primary: boolean; reliability_level: number }
}

const BLOCK = { estadual: 'estado', nacional: 'nacional', internacional: 'internacional' } as const

/**
 * Entrada da IA para um assunto, montada só com as matérias do banco (oficial e mais confiável primeiro) —
 * a mesma usada na análise; a auditoria confere o texto contra exatamente estas fontes.
 */
export async function loadClusterInput(ctx: JobContext, clusterId: string): Promise<AnalysisInput | null> {
  const { data: c, error: e0 } = await ctx.db.from('news_clusters').select('id, scope, state, category, verification_status, source_count').eq('id', clusterId).maybeSingle()
  if (e0) throw new Error(`assunto: ${e0.message}`)
  if (!c) return null
  const { data: ms, error: e1 } = await ctx.db
    .from('news')
    .select('title, excerpt, original_content, original_url, published_at, news_sources!inner(name, is_primary, reliability_level)')
    .eq('cluster_id', clusterId)
    .eq('status', 'clustered')
  if (e1) throw new Error(`matérias: ${e1.message}`)
  const members = ((ms ?? []) as unknown as Member[]).sort((a, b) => Number(b.news_sources.is_primary) - Number(a.news_sources.is_primary) || b.news_sources.reliability_level - a.news_sources.reliability_level)
  if (!members.length) return null
  const { data: ver } = await ctx.db.from('news_verifications').select('analysis').eq('cluster_id', clusterId).order('verified_at', { ascending: false }).limit(1).maybeSingle()
  return buildInput(
    { block: BLOCK[c.scope as keyof typeof BLOCK], state: c.state, category: c.category, verification: { status: c.verification_status ?? 'insuficiente', independent_sources: c.source_count, summary: ver?.analysis ?? '' } },
    members.map((m) => ({ source: m.news_sources.name, official: m.news_sources.is_primary, title: m.title, url: m.original_url, published_at: m.published_at, text: [m.excerpt, m.original_content].filter(Boolean).join(' ') })),
  )
}
