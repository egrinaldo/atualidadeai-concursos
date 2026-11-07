import { selectAll } from '../db/paginate.ts'
import { DEFAULT_ITEMS_PER_BLOCK, editionTypesFor, editionWindow, referenceDateFor, selectEditionItems, type EditionCandidate } from '../pdf/edition.ts'
import type { BlockKey, EditionType } from '../pdf/model.ts'
import { periodStories, planStory, synthesisKindFor } from '../period/plan.ts'
import { selectStories, type Story } from '../period/stories.ts'
import { SYNTHESIS_VERSION } from '../period/synthesis.ts'
import { repeatDecisions, type Published } from '../pdf/repeats.ts'
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
  news_analyses: { id: string; status: string; generated_at: string; editorial_title: string; summary: string }[]
}

/**
 * Montagem das edições: para cada UF piloto e cada tipo devido na data (diária; semanal às segundas; mensal no dia 1),
 * escolhe os assuntos analisados mais relevantes de cada bloco (Estado → Nacional → Internacional) e grava
 * editions + edition_items. Edição já gerada/publicada não é alterada (salvo payload { force: true }).
 * Diária: assuntos analisados da janela, com auditoria não reprovada. Semanal/mensal: histórias montadas a partir
 * das edições anteriores (period/), usando a síntese auditada quando existe ou o texto mais recente da história.
 * Payload opcional: { referenceDate: 'AAAA-MM-DD', types: ['diaria'], force, stage: 'diaria' | 'periodo' }.
 */
export async function composeJob(job: { payload: Record<string, unknown> }, ctx: JobContext) {
  const get = await loadSettings(ctx)
  const referenceDate = typeof job.payload.referenceDate === 'string' ? job.payload.referenceDate : referenceDateFor(new Date())
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) throw new Error(`data inválida: ${referenceDate}`)
  const due = (Array.isArray(job.payload.types) ? job.payload.types : editionTypesFor(referenceDate)) as EditionType[]
  // Etapas do fluxo das 22h: "diaria" monta a diária; "periodo" monta semanal/mensal depois das sínteses
  const types = job.payload.stage === 'diaria' ? due.filter((t) => t === 'diaria') : job.payload.stage === 'periodo' ? due.filter((t) => t !== 'diaria') : due
  if (!types.length) return { referenceDate, types, editions: [] }
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

  const windows = Object.fromEntries(types.map((t) => [t, editionWindow(t, referenceDate, cutoff)])) as Record<EditionType, { start: string; end: string }>
  // Só a diária busca assuntos direto (semanal/mensal partem das edições anteriores)
  const earliest = windows.diaria ? new Date(Date.parse(windows.diaria.start) - 12 * 3_600_000).toISOString() : ''
  const allowed = (['baixa', 'media', 'alta', 'muito_alta'] as Relevance[]).filter((r) => RELEVANCE_RANK[r] >= RELEVANCE_RANK[minRelevance])
  const rows = (!types.includes('diaria') ? [] : await selectAll((from, to) =>
    ctx.db
      .from('news_clusters')
      .select('id, scope, state, relevance, relevance_score, verification_status, needs_review, source_count, last_seen_at, news!inner(news_sources!inner(reliability_level)), news_analyses!inner(id, status, generated_at, editorial_title, summary)')
      .eq('status', 'analyzed')
      .in('relevance', allowed)
      .in('news_analyses.status', ['valid', 'edited'])
      .eq('news_analyses.kind', 'analise')
      .in('news_analyses.audit_status', ['pendente', 'aprovada', 'dispensada']) // reprovada/erro não entram
      .gte('last_seen_at', earliest)
      .order('id')
      .range(from, to),
  ).catch((e) => { throw new Error(`assuntos: ${e.message}`) })) as unknown as Row[]

  const cands: (EditionCandidate & { title: string; summary: string })[] = rows.map((r) => {
    const latest = [...r.news_analyses].sort((a, b) => b.generated_at.localeCompare(a.generated_at))[0]
    return { ...r, analysis_id: latest.id, title: latest.editorial_title, summary: latest.summary, best_reliability: Math.max(...r.news.map((n) => n.news_sources.reliability_level)) }
  })

  const results: Record<string, unknown>[] = []
  for (const state of states)
    for (const type of types) {
      let sel: Record<BlockKey, { analysis_id: string }[]>
      let periodInfo: Record<string, unknown> | null = null
      let repeats: { updates: Record<string, string>; skipped: { analysis_id: string; reason: string }[] } | null = null
      if (type === 'diaria') {
        // Nada que já saiu numa diária anterior volta sem fato novo (e, se voltar, vem como "Atualização")
        const decisions = repeatDecisions(cands, await publishedDaily(ctx, state, referenceDate), referenceDate, { similarity: Number(get('edition.repeat_similarity', 0.6)) })
        const fresh = cands.filter((c) => decisions.get(c.analysis_id)?.keep !== false)
        sel = selectEditionItems(fresh, { ...policyBase, state, window: windows[type], perBlock: perBlockAll[type], graceHours: 12 })
        const chosen = new Set((['estado', 'nacional', 'internacional'] as BlockKey[]).flatMap((b) => sel[b].map((x) => x.analysis_id)))
        const updates: Record<string, string> = {}
        for (const id of chosen) {
          const d = decisions.get(id)
          if (d?.keep && d.updateOf) updates[id] = d.updateOf
        }
        const skipped = cands.flatMap((c) => {
          const d = decisions.get(c.analysis_id)
          return d && !d.keep ? [{ analysis_id: c.analysis_id, reason: d.reason }] : []
        })
        repeats = { updates, skipped }
      } else {
        const p = await periodItems(ctx, type, state, referenceDate, perBlockAll[type], Number(get('synthesis.similarity_threshold', 0.4)))
        sel = p.sel
        periodInfo = p.info
      }
      const total = sel.estado.length + sel.nacional.length + sel.internacional.length
      const { data: existing } = await ctx.db.from('editions').select('id, status').eq('edition_type', type).eq('reference_date', referenceDate).eq('state', state).maybeSingle()
      if (existing && ['generating', 'generated', 'published'].includes(existing.status) && !force) {
        results.push({ state, type, skipped: `edição já ${existing.status}` })
        continue
      }
      const summary = {
        blocks: { estado: sel.estado.length, nacional: sel.nacional.length, internacional: sel.internacional.length },
        candidates: type === 'diaria' ? cands.length : undefined,
        ...(periodInfo ? { period: periodInfo } : {}),
        ...(repeats ? { updates: repeats.updates, repeats_skipped: repeats.skipped.length } : {}),
        composed_at: new Date().toISOString(),
      }
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

/**
 * Itens da semanal/mensal: as histórias de maior peso de cada bloco. História de um texto só → esse texto;
 * com vários → a síntese (se gerada, válida e não reprovada na auditoria) ou, na falta dela, o texto mais recente.
 */
async function periodItems(ctx: JobContext, type: 'semanal' | 'mensal', state: string, referenceDate: string, perBlock: Record<BlockKey, number>, threshold: number) {
  const kind = synthesisKindFor(type)
  const period = await periodStories(ctx, type, state, referenceDate, threshold)
  const chosen = selectStories(period.stories, perBlock)
  const hashes = (['estado', 'nacional', 'internacional'] as BlockKey[]).flatMap((b) => chosen[b].map((s) => planStory(s, kind).hash).filter((h): h is string => !!h))
  const synth = new Map<string, string>()
  if (hashes.length) {
    const { data, error } = await ctx.db.from('news_analyses').select('id, input_hash, generated_at').eq('kind', kind).eq('prompt_version', SYNTHESIS_VERSION).in('input_hash', hashes).in('status', ['valid', 'edited']).in('audit_status', ['pendente', 'aprovada', 'dispensada']).order('generated_at')
    if (error) throw new Error(`sínteses: ${error.message}`)
    for (const r of data ?? []) synth.set(r.input_hash, r.id) // a mais recente prevalece
  }
  const latestEntry = (s: Story) => [...s.entries].sort((a, b) => (b.dates.at(-1) ?? '').localeCompare(a.dates.at(-1) ?? '') || b.generatedAt.localeCompare(a.generatedAt))[0].analysisId
  let syntheses = 0
  let fallbacks = 0
  const sel = Object.fromEntries((['estado', 'nacional', 'internacional'] as BlockKey[]).map((b) => [b, chosen[b].map((s) => {
    const plan = planStory(s, kind)
    if (plan.reuse) return { analysis_id: plan.reuse }
    const id = synth.get(plan.hash!)
    if (id) syntheses++
    else fallbacks++
    return { analysis_id: id ?? latestEntry(s) }
  })])) as Record<BlockKey, { analysis_id: string }[]>
  // Dois blocos/histórias nunca apontam para o mesmo texto (chave da tabela)
  const seen = new Set<string>()
  for (const b of ['estado', 'nacional', 'internacional'] as BlockKey[]) sel[b] = sel[b].filter((x) => !seen.has(x.analysis_id) && seen.add(x.analysis_id))
  return { sel, info: { from: period.from, to: period.to, entries: period.entries, dropped_by_audit: period.dropped, stories: period.stories.length, syntheses, fallbacks, weeklies: period.weeklies } }
}

/** Itens das diárias já montadas/publicadas da UF nos últimos 10 dias (para não repetir). */
async function publishedDaily(ctx: JobContext, state: string, referenceDate: string): Promise<Published[]> {
  const from = new Date(Date.parse(`${referenceDate}T12:00:00Z`) - 10 * 86_400_000).toISOString().slice(0, 10)
  const { data, error } = await ctx.db
    .from('edition_items')
    .select('analysis_id, editions!inner(reference_date, period_end, state, edition_type, status), news_analyses!inner(cluster_id, editorial_title, summary)')
    .eq('editions.edition_type', 'diaria')
    .eq('editions.state', state)
    .in('editions.status', ['in_review', 'approved', 'generating', 'generated', 'published'])
    .gte('editions.reference_date', from)
    .lt('editions.reference_date', referenceDate)
    .limit(1000)
  if (error) throw new Error(`edições anteriores: ${error.message}`)
  type R = { analysis_id: string; editions: { reference_date: string; period_end: string }; news_analyses: { cluster_id: string; editorial_title: string; summary: string } }
  return ((data ?? []) as unknown as R[]).map((r) => ({ clusterId: r.news_analyses.cluster_id, analysisId: r.analysis_id, referenceDate: r.editions.reference_date, periodEnd: r.editions.period_end, title: r.news_analyses.editorial_title ?? '', summary: r.news_analyses.summary ?? '' }))
}
