import { aiClient, dbUsageStore, type AIClient } from '../ai/client.ts'
import { nvidiaProvider } from '../ai/nvidia.ts'
import { AIError } from '../ai/types.ts'
import { generateAnalysis, toAnalysisRow } from '../analysis/generate.ts'
import { buildInput, inputHash, PROMPT_VERSION, type AnalysisInput } from '../analysis/prompt.ts'
import { selectForAnalysis, type Block, type Candidate, type SelectionPolicy } from '../analysis/select.ts'
import type { Relevance } from '../triage/classify.ts'
import type { JobContext } from './types.ts'

/** Modelos verificados na conta NVIDIA em 05/11/2026 (ordem = preferência; o seguinte é usado se o anterior falhar). */
export const DEFAULT_ANALYSIS_MODELS = ['nvidia/nemotron-3.5-lightning-30b-a3b', 'nvidia/nemotron-3-ultra-550b-a55b']
export const ANALYZE_DEFAULTS = { perBlock: { estado: 5, nacional: 6, internacional: 4 }, maxCallsPerRun: 6, dailyBudget: 60, lookbackHours: 36 }

async function settings(ctx: JobContext) {
  const { data, error } = await ctx.db.from('app_settings').select('key, value')
  if (error) throw new Error(`configurações: ${error.message}`)
  const m = new Map((data ?? []).map((r) => [r.key as string, r.value as unknown]))
  const get = <T>(k: string, d: T): T => (m.has(k) && m.get(k) !== null ? (m.get(k) as T) : d)
  const models = get<{ analysis?: string[] }>('ai.models', {}).analysis
  return {
    policy: {
      pilotStates: get<string[]>('pipeline.pilot_states', ['CE']),
      perBlock: { ...ANALYZE_DEFAULTS.perBlock, ...get<Partial<Record<Block, number>>>('ai.analysis_per_block', {}) },
      minRelevance: get<Relevance>('triage.min_relevance_for_edition', 'media'),
      editionStatuses: get<string[]>('verification.edition_statuses', ['corroborada', 'parcialmente_corroborada', 'nao_confirmada']),
      singleSourceMinReliability: Number(get('verification.single_source_min_reliability', 4)),
    } satisfies SelectionPolicy,
    models: models?.length ? models : DEFAULT_ANALYSIS_MODELS,
    dailyBudget: Number(get('ai.daily_call_budget', ANALYZE_DEFAULTS.dailyBudget)),
    maxCallsPerRun: Number(get('ai.max_calls_per_run', ANALYZE_DEFAULTS.maxCallsPerRun)),
    lookbackHours: Number(get('ai.lookback_hours', ANALYZE_DEFAULTS.lookbackHours)),
  }
}

type Member = {
  id: string
  title: string
  excerpt: string | null
  original_content: string | null
  original_url: string
  published_at: string | null
  news_sources: { name: string; is_primary: boolean; reliability_level: number }
}

/**
 * Análise pela IA: escolhe os assuntos mais relevantes de cada bloco, monta a entrada só com as fontes do banco,
 * reaproveita análise de entrada idêntica (sem nova chamada), respeita a cota diária e o limite por rodada,
 * e grava o resultado validado (ou inválido, para revisão) em news_analyses.
 */
export async function analyzeJob(job: { id: string; payload: Record<string, unknown> }, ctx: JobContext, deps?: { ai?: AIClient }) {
  if (!deps?.ai && !ctx.config.NVIDIA_API_KEY) {
    ctx.log.warn('análise: NVIDIA_API_KEY ausente — etapa ignorada')
    return { skipped: 'sem chave de IA' }
  }
  const cfg = await settings(ctx)
  const models = ctx.config.NVIDIA_MODEL ? [ctx.config.NVIDIA_MODEL, ...cfg.models.filter((m) => m !== ctx.config.NVIDIA_MODEL)] : cfg.models
  const ai = deps?.ai ?? aiClient(nvidiaProvider({ apiKey: ctx.config.NVIDIA_API_KEY!, baseUrl: ctx.config.NVIDIA_BASE_URL }), dbUsageStore(ctx.db), { dailyBudget: cfg.dailyBudget })
  const jobId = job.id === 'direto' ? null : job.id

  const since = new Date(Date.now() - cfg.lookbackHours * 3_600_000).toISOString()
  const { data: rows, error } = await ctx.db
    .from('news_clusters')
    .select('id, status, scope, state, category, relevance, relevance_score, verification_status, needs_review, source_count, news!inner(news_sources!inner(reliability_level))')
    // Analisados também entram na disputa pelas vagas de cada bloco (senão cada rodada desceria na fila gastando cota)
    .in('status', ['verified', 'analyzed'])
    .gte('last_seen_at', since)
    .limit(2000)
  if (error) throw new Error(`assuntos: ${error.message}`)
  type Row = Omit<Candidate, 'best_reliability'> & { status: string; category: string | null; source_count: number; news: { news_sources: { reliability_level: number } }[] }
  const clusters = new Map(((rows ?? []) as unknown as Row[]).map((r) => [r.id, r]))
  const cands: Candidate[] = [...clusters.values()].map((r) => ({ ...r, best_reliability: Math.max(...r.news.map((n) => n.news_sources.reliability_level)) }))
  const selected = selectForAnalysis(cands, cfg.policy)

  // Execução manual pode pedir menos chamadas (payload { maxCalls }); nunca mais que o limite configurado
  const maxCalls = Math.min(cfg.maxCallsPerRun, Number(job.payload.maxCalls ?? cfg.maxCallsPerRun) || cfg.maxCallsPerRun)
  const stats = { selected: selected.length, already_analyzed: 0, analyzed: 0, reused: 0, invalid: 0, skipped_invalid_before: 0, calls: 0, stopped: null as string | null }
  for (const sel of selected) {
    if (stats.calls >= maxCalls && clusters.get(sel.id)!.status !== 'analyzed') {
      stats.stopped = `limite por rodada (${maxCalls} chamadas)`
      break
    }
    const c = clusters.get(sel.id)!
    if (c.status === 'analyzed') {
      stats.already_analyzed++
      continue
    }
    const { data: ms, error: e1 } = await ctx.db
      .from('news')
      .select('id, title, excerpt, original_content, original_url, published_at, news_sources!inner(name, is_primary, reliability_level)')
      .eq('cluster_id', c.id)
      .eq('status', 'clustered')
    if (e1) throw new Error(`matérias: ${e1.message}`)
    const members = ((ms ?? []) as unknown as Member[]).sort((a, b) => Number(b.news_sources.is_primary) - Number(a.news_sources.is_primary) || b.news_sources.reliability_level - a.news_sources.reliability_level)
    if (!members.length) continue
    const { data: ver } = await ctx.db.from('news_verifications').select('analysis').eq('cluster_id', c.id).order('verified_at', { ascending: false }).limit(1).maybeSingle()
    const input: AnalysisInput = buildInput(
      { block: sel.block, state: sel.state, category: c.category, verification: { status: c.verification_status!, independent_sources: c.source_count, summary: ver?.analysis ?? '' } },
      members.map((m) => ({ source: m.news_sources.name, official: m.news_sources.is_primary, title: m.title, url: m.original_url, published_at: m.published_at, text: [m.excerpt, m.original_content].filter(Boolean).join(' ') })),
    )
    const hash = inputHash(input)

    // Mesma entrada já analisada: reaproveita (válida) ou não insiste (inválida → aguarda revisão)
    const { data: prev } = await ctx.db.from('news_analyses').select('id, status').eq('cluster_id', c.id).eq('input_hash', hash).eq('prompt_version', PROMPT_VERSION).in('status', ['valid', 'invalid', 'edited'])
    if (prev?.some((p) => p.status === 'valid' || p.status === 'edited')) {
      await ctx.db.from('news_clusters').update({ status: 'analyzed' }).eq('id', c.id).eq('status', 'verified')
      stats.reused++
      continue
    }
    if (prev?.some((p) => p.status === 'invalid')) {
      stats.skipped_invalid_before++
      continue
    }

    let g
    try {
      g = await generateAnalysis(ai, models, input, { jobId })
    } catch (e) {
      if (e instanceof AIError && e.kind === 'budget') {
        stats.stopped = e.message
        break
      }
      ctx.log.warn('análise: falha na IA', { cluster: c.id, error: (e as Error).message })
      stats.calls++ // a tentativa consumiu cota
      continue
    }
    stats.calls += g.calls
    const base = { cluster_id: c.id, provider: g.provider, model: g.model, prompt_version: PROMPT_VERSION, input_hash: hash }
    if (g.status === 'valid') {
      // Versões anteriores válidas deste assunto deixam de valer
      await ctx.db.from('news_analyses').update({ status: 'superseded' }).eq('cluster_id', c.id).eq('status', 'valid')
      const { error: e2 } = await ctx.db.from('news_analyses').insert({ ...base, status: 'valid', ...toAnalysisRow(g.data, input), validation_errors: g.warnings.length ? { avisos: g.warnings } : null })
      if (e2) throw new Error(`gravar análise: ${e2.message}`)
      // Avisos (ex.: número sem fonte no contexto) mandam o assunto para revisão antes do PDF
      await ctx.db.from('news_clusters').update({ status: 'analyzed', needs_review: g.warnings.some((w) => w.includes('sem origem')) }).eq('id', c.id)
      stats.analyzed++
    } else {
      const { error: e2 } = await ctx.db.from('news_analyses').insert({ ...base, status: 'invalid', content: { bruto: g.raw }, validation_errors: { erros: g.errors, avisos: g.warnings } })
      if (e2) throw new Error(`gravar análise inválida: ${e2.message}`)
      await ctx.db.from('news_clusters').update({ needs_review: true }).eq('id', c.id)
      stats.invalid++
    }
  }
  return { ...stats, models, remaining_budget: await ai.remaining() }
}
