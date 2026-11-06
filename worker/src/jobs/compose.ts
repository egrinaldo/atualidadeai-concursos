import { selectAll } from '../db/paginate.ts'
import { DEFAULT_ITEMS_PER_BLOCK, editionTypesFor, editionWindow, referenceDateFor, selectEditionItems, type EditionCandidate } from '../pdf/edition.ts'
import type { BlockKey, EditionType } from '../pdf/model.ts'
import { RELEVANCE_RANK, type Relevance } from '../triage/classify.ts'
import type { JobContext } from './types.ts'

export async function loadSettings(ctx: JobContext) {
  const { data, error } = await ctx.db.from('app_settings').select('key, value')
  if (error) throw new Error(`configurações: ${error.message}`)
  const m = new Map((data ?? []).map((r) => [r.key as string, r.value as unknown]))
  return <T>(k: string, d: T): T => (m.has(k) && m.get(k) !== null ? (m.get(k) as T) : d)
}

type Row = {
  id: string
  scope: 'estadual' | 'nacional' | 'internacional'
  state: string | null
  relevance: Relevance | null
  relevance_score: number | null
  verification_status: string | null
  needs_review: boolean
  source_count: number
  last_seen_at: string
  news: { news_sources: { reliability_level: number } }[]
  news_analyses: { id: string; status: string; generated_at: string }[]
}

/**
 * Montagem das edições: para cada UF piloto e cada tipo devido na data (diária; semanal às segundas; mensal no dia 1),
 * escolhe os assuntos analisados mais relevantes de cada bloco (Estado → Nacional → Internacional) e grava
 * editions + edition_items. Edição já gerada/publicada não é alterada (salvo payload { force: true }).
 * Payload opcional: { referenceDate: 'AAAA-MM-DD', types: ['diaria'], force }.
 */
export async function composeJob(job: { payload: Record<string, unknown> }, ctx: JobContext) {
  const get = await loadSettings(ctx)
  const referenceDate = typeof job.payload.referenceDate === 'string' ? job.payload.referenceDate : referenceDateFor(new Date())
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) throw new Error(`data inválida: ${referenceDate}`)
  const types = (Array.isArray(job.payload.types) ? job.payload.types : editionTypesFor(referenceDate)) as EditionType[]
  const force = job.payload.force === true
  const states = get<string[]>('pipeline.pilot_states', ['CE'])
  const cutoff = get<string>('pipeline.edition_cutoff', '22:00')
  const perBlockAll = { ...DEFAULT_ITEMS_PER_BLOCK, ...get<Partial<typeof DEFAULT_ITEMS_PER_BLOCK>>('edition.items_per_block', {}) }
  const minRelevance = get<Relevance>('triage.min_relevance_for_edition', 'media')
  const policyBase = {
    pilotStates: states,
    minRelevance,
    editionStatuses: get<string[]>('verification.edition_statuses', ['corroborada', 'parcialmente_corroborada', 'nao_confirmada']),
    singleSourceMinReliability: Number(get('verification.single_source_min_reliability', 4)),
  }

  // Janela mais longa entre os tipos do dia (a mensal cobre todas)
  const windows = Object.fromEntries(types.map((t) => [t, editionWindow(t, referenceDate, cutoff)])) as Record<EditionType, { start: string; end: string }>
  const earliest = new Date(Math.min(...types.map((t) => Date.parse(windows[t].start))) - 12 * 3_600_000).toISOString()
  const allowed = (['baixa', 'media', 'alta', 'muito_alta'] as Relevance[]).filter((r) => RELEVANCE_RANK[r] >= RELEVANCE_RANK[minRelevance])
  const rows = (await selectAll((from, to) =>
    ctx.db
      .from('news_clusters')
      .select('id, scope, state, relevance, relevance_score, verification_status, needs_review, source_count, last_seen_at, news!inner(news_sources!inner(reliability_level)), news_analyses!inner(id, status, generated_at)')
      .eq('status', 'analyzed')
      .in('relevance', allowed)
      .in('news_analyses.status', ['valid', 'edited'])
      .gte('last_seen_at', earliest)
      .order('id')
      .range(from, to),
  ).catch((e) => { throw new Error(`assuntos: ${e.message}`) })) as unknown as Row[]

  const cands: EditionCandidate[] = rows.map((r) => {
    const latest = [...r.news_analyses].sort((a, b) => b.generated_at.localeCompare(a.generated_at))[0]
    return { ...r, analysis_id: latest.id, best_reliability: Math.max(...r.news.map((n) => n.news_sources.reliability_level)) }
  })

  const results: Record<string, unknown>[] = []
  for (const state of states)
    for (const type of types) {
      const sel = selectEditionItems(cands, { ...policyBase, state, window: windows[type], perBlock: perBlockAll[type], graceHours: type === 'diaria' ? 12 : 0 })
      const total = sel.estado.length + sel.nacional.length + sel.internacional.length
      const { data: existing } = await ctx.db.from('editions').select('id, status').eq('edition_type', type).eq('reference_date', referenceDate).eq('state', state).maybeSingle()
      if (existing && ['generating', 'generated', 'published'].includes(existing.status) && !force) {
        results.push({ state, type, skipped: `edição já ${existing.status}` })
        continue
      }
      const summary = { blocks: { estado: sel.estado.length, nacional: sel.nacional.length, internacional: sel.internacional.length }, candidates: cands.length, composed_at: new Date().toISOString() }
      const row = { edition_type: type, state, reference_date: referenceDate, period_start: windows[type].start, period_end: windows[type].end, status: total ? 'in_review' : 'draft', summary }
      const { data: ed, error: e1 } = existing
        ? await ctx.db.from('editions').update(row).eq('id', existing.id).select('id').single()
        : await ctx.db.from('editions').insert(row).select('id').single()
      if (e1 || !ed) throw new Error(`edição ${type}/${state}: ${e1?.message}`)
      const { error: e2 } = await ctx.db.from('edition_items').delete().eq('edition_id', ed.id)
      if (e2) throw new Error(`itens (limpar): ${e2.message}`)
      const items = (['estado', 'nacional', 'internacional'] as BlockKey[]).flatMap((block) => sel[block].map((c, position) => ({ edition_id: ed.id, analysis_id: c.analysis_id, block, position })))
      if (items.length) {
        const { error: e3 } = await ctx.db.from('edition_items').insert(items)
        if (e3) throw new Error(`itens (gravar): ${e3.message}`)
      }
      results.push({ state, type, edition_id: ed.id, ...summary.blocks })
      ctx.log.info('edição montada', { state, type, referenceDate, ...summary.blocks })
    }
  return { referenceDate, types, editions: results }
}
