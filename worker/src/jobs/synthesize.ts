import { aiClient, dbUsageStore, type AIClient } from '../ai/client.ts'
import { nvidiaProvider } from '../ai/nvidia.ts'
import { AIError } from '../ai/types.ts'
import { DEFAULT_ITEMS_PER_BLOCK, editionTypesFor, referenceDateFor } from '../pdf/edition.ts'
import type { EditionType } from '../pdf/model.ts'
import { periodStories, planStory, synthesisKindFor } from '../period/plan.ts'
import { selectStories, type Story } from '../period/stories.ts'
import { generateSynthesis, mergeReferences, SYNTHESIS_VERSION, synthesisInput } from '../period/synthesis.ts'
import { DEFAULT_ANALYSIS_MODELS } from './analyze.ts'
import { editionStates, loadSettings } from './compose.ts'
import type { JobContext } from './types.ts'

/** Cluster "principal" da história: o do texto mais relevante (a síntese fica ligada a ele). */
export const mainCluster = (s: Story) => [...s.entries].sort((a, b) => b.score - a.score)[0].clusterIds[0]

/**
 * Sínteses das revisões semanal (segundas) e mensal (dia 1): para cada UF e tipo devido na data, agrupa os textos
 * das edições anteriores em histórias, escolhe as de maior peso de cada bloco e, para as que têm mais de um texto,
 * gera (ou reaproveita) uma síntese com linha do tempo. Roda depois de montar a diária do dia e antes da auditoria.
 * Payload opcional: { referenceDate, types: ['semanal'|'mensal'], maxCalls }.
 */
export async function synthesizeJob(job: { id: string; payload: Record<string, unknown> }, ctx: JobContext, deps?: { ai?: AIClient }) {
  const referenceDate = typeof job.payload.referenceDate === 'string' ? job.payload.referenceDate : referenceDateFor(new Date())
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) throw new Error(`data inválida: ${referenceDate}`)
  const types = ((Array.isArray(job.payload.types) ? job.payload.types : editionTypesFor(referenceDate)) as EditionType[]).filter((t): t is 'semanal' | 'mensal' => t === 'semanal' || t === 'mensal')
  if (!types.length) return { referenceDate, skipped: 'nenhuma revisão semanal/mensal nesta data' }
  if (!deps?.ai && !ctx.config.NVIDIA_API_KEY) {
    ctx.log.warn('síntese: NVIDIA_API_KEY ausente — revisões usarão os textos diários')
    return { referenceDate, skipped: 'sem chave de IA' }
  }
  const get = await loadSettings(ctx)
  const states = await editionStates(ctx, get<string[]>('pipeline.pilot_states', ['CE']))
  const perBlockAll = { ...DEFAULT_ITEMS_PER_BLOCK, ...get<Partial<typeof DEFAULT_ITEMS_PER_BLOCK>>('edition.items_per_block', {}) }
  const threshold = Number(get('synthesis.similarity_threshold', 0.4))
  const maxCalls = Math.min(Number(get('synthesis.max_calls_per_run', 12)), Number(job.payload.maxCalls ?? Infinity) || Infinity)
  const models = get<{ synthesis?: string[]; analysis?: string[] }>('ai.models', {})
  const synthModels = models.synthesis?.length ? models.synthesis : models.analysis?.length ? models.analysis : DEFAULT_ANALYSIS_MODELS
  const ai = deps?.ai ?? aiClient(nvidiaProvider({ apiKey: ctx.config.NVIDIA_API_KEY!, baseUrl: ctx.config.NVIDIA_BASE_URL }), dbUsageStore(ctx.db), { dailyBudget: Number(get('ai.daily_call_budget', 120)) })
  const jobId = job.id === 'direto' ? null : job.id

  const stats = { referenceDate, types, generated: 0, reused: 0, single: 0, invalid: 0, calls: 0, stopped: null as string | null, editions: [] as Record<string, unknown>[] }
  outer: for (const state of states)
    for (const type of types) {
      const kind = synthesisKindFor(type)
      const period = await periodStories(ctx, type, state, referenceDate, threshold)
      const sel = selectStories(period.stories, perBlockAll[type])
      const chosen = [...sel.estado, ...sel.nacional, ...sel.internacional]
      stats.editions.push({ state, type, from: period.from, to: period.to, entries: period.entries, stories: period.stories.length, chosen: chosen.length, multi: chosen.filter((s) => s.entries.length > 1).length, weeklies: period.weeklies })
      for (const story of chosen) {
        const plan = planStory(story, kind)
        if (!plan.hash) {
          stats.single++
          continue
        }
        const { data: prev } = await ctx.db.from('news_analyses').select('id, status').eq('kind', kind).eq('prompt_version', SYNTHESIS_VERSION).eq('input_hash', plan.hash).in('status', ['valid', 'edited', 'invalid'])
        if (prev?.length) {
          if (prev.some((p) => p.status !== 'invalid')) stats.reused++
          else stats.invalid++
          continue
        }
        if (stats.calls >= maxCalls) {
          stats.stopped = `limite por rodada (${maxCalls} chamadas)`
          break outer
        }
        const input = synthesisInput(story, story.block === 'estado' ? state : null)
        let g
        try {
          g = await generateSynthesis(ai, synthModels, input, kind, jobId)
        } catch (e) {
          if (e instanceof AIError && e.kind === 'budget') {
            stats.stopped = e.message
            break outer
          }
          stats.calls++
          ctx.log.warn('síntese: falha na IA', { error: (e as Error).message })
          continue
        }
        stats.calls += g.calls
        const meta = {
          edition_type: type, state, reference_date: referenceDate, block: story.block,
          cluster_ids: story.clusterIds, source_analysis_ids: story.entries.map((e) => e.analysisId), dates: story.dates,
          input_sources: input.sources, ...(g.status === 'valid' ? { timeline: g.timeline } : {}),
        }
        const base = { cluster_id: mainCluster(story), provider: g.provider, model: g.model, prompt_version: SYNTHESIS_VERSION, input_hash: plan.hash, kind, period_meta: meta }
        if (g.status === 'valid') {
          const d = g.data
          const { error } = await ctx.db.from('news_analyses').insert({
            ...base, status: 'valid',
            editorial_title: d.titulo_editorial, summary: d.resumo, what_happened: d.o_que_aconteceu, context: d.contexto || null, historical_background: d.antecedentes || null,
            political_analysis: d.analise_politica || null, economic_analysis: d.analise_economica || null, social_impact: d.impacto_social || null, why_it_matters: d.por_que_importa,
            consequences: { confirmados: d.consequencias.confirmadas, projecoes: d.consequencias.projecoes }, relevance_for_exams: d.relevancia_para_concursos,
            possible_exam_topics: d.temas_de_prova, memorize: d.memorizar, exam_approaches: d.abordagens_em_prova, questions: d.questoes,
            references: mergeReferences(story), content: { ...d, linha_do_tempo: g.timeline },
            validation_errors: g.warnings.length ? { avisos: g.warnings } : null,
          })
          if (error) throw new Error(`gravar síntese: ${error.message}`)
          stats.generated++
          ctx.log.info('síntese gerada', { state, type, block: story.block, texts: story.entries.length, days: story.dates.length })
        } else {
          const { error } = await ctx.db.from('news_analyses').insert({ ...base, status: 'invalid', content: { bruto: g.raw }, validation_errors: { erros: g.errors } })
          if (error) throw new Error(`gravar síntese inválida: ${error.message}`)
          stats.invalid++
        }
      }
    }
  return { ...stats, remaining_budget: await ai.remaining() }
}
