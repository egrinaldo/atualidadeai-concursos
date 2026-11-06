import { triage, type Scope } from '../triage/classify.ts'
import type { JobContext } from './types.ts'

export const TRIAGE_BATCH = 500

/** Executa tarefas assíncronas com no máximo `n` simultâneas. */
export async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++])
  }))
}

type Row = {
  id: string
  title: string
  excerpt: string | null
  language: string
  scope: Scope | null
  state: string | null
  category: string | null
  news_sources: { scope: Scope; state: string | null; default_category: string | null; reliability_level: number; is_primary: boolean; language: string }
}

/**
 * Triagem: classifica as notícias recém-coletadas (idioma, alcance/UF, categoria, relevância 0–100 com motivos)
 * e descarta o que não é notícia para o produto. Determinística — não usa IA.
 */
export async function triageJob(job: { payload: Record<string, unknown> }, ctx: JobContext) {
  // Volume alto: repete em lotes até esvaziar (máx. 8 lotes por rodada)
  const total: Record<string, number | boolean> = {}
  for (let i = 0; i < 8; i++) {
    const r = await triageBatch(job, ctx)
    for (const [k, v] of Object.entries(r)) if (typeof v === 'number') total[k] = Number(total[k] ?? 0) + v
    total.more_pending = r.more_pending
    if (!r.more_pending) break
  }
  return total
}

async function triageBatch(_job: { payload: Record<string, unknown> }, ctx: JobContext) {
  const { data, error } = await ctx.db
    .from('news')
    .select('id, title, excerpt, language, scope, state, category, news_sources!inner(scope, state, default_category, reliability_level, is_primary, language)')
    .eq('status', 'collected')
    .order('collected_at', { ascending: true })
    .limit(TRIAGE_BATCH)
  if (error) throw new Error(`leitura: ${error.message}`)
  const rows = (data ?? []) as unknown as Row[]
  const now = new Date().toISOString()
  const counts = { triaged: 0, discarded: 0, muito_alta: 0, alta: 0, media: 0, baixa: 0, reclassified_scope: 0, errors: 0 }

  await pool(rows, 8, async (r) => {
    const res = triage({ ...r, source: r.news_sources })
    const update = res.discard
      ? { status: 'discarded', discard_reason: res.reason, language: res.language, triaged_at: now }
      : {
          status: 'triaged',
          language: res.language,
          scope: res.scope,
          state: res.state,
          category: res.category,
          relevance: res.relevance,
          relevance_score: res.score,
          triage_reasons: res.reasons,
          triaged_at: now,
        }
    // Condição de status evita sobrescrever se outra execução já tratou a notícia
    const { error: e } = await ctx.db.from('news').update(update).eq('id', r.id).eq('status', 'collected')
    if (e) {
      counts.errors++
      ctx.log.warn('triagem: falha ao gravar', { id: r.id, error: e.message })
      return
    }
    if (res.discard) counts.discarded++
    else {
      counts.triaged++
      counts[res.relevance]++
      if (res.scope !== r.news_sources.scope) counts.reclassified_scope++
    }
  })
  if (counts.errors) throw new Error(`triagem: ${counts.errors} gravações falharam`)
  return { read: rows.length, ...counts, more_pending: rows.length === TRIAGE_BATCH }
}
