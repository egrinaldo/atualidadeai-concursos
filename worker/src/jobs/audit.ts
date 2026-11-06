import { aiClient, dbUsageStore, type AIClient } from '../ai/client.ts'
import { nvidiaProvider } from '../ai/nvidia.ts'
import { AIError } from '../ai/types.ts'
import { loadClusterInput } from '../analysis/load.ts'
import { buildMessages, type AnalysisInput, type AnalysisSource } from '../analysis/prompt.ts'
import { toAnalysisRow } from '../analysis/generate.ts'
import { validateAnalysis } from '../analysis/validate.ts'
import { AUDIT_PROMPT_VERSION, auditHash, buildAuditMessages, judge, type AuditReport, type AuditTarget } from '../audit/audit.ts'
import { loadSettings } from './compose.ts'
import { DEFAULT_ANALYSIS_MODELS } from './analyze.ts'
import type { JobContext } from './types.ts'

/** Auditor = modelo DIFERENTE do redator (o maior disponível), para não "concordar consigo mesmo". */
export const DEFAULT_AUDIT_MODELS = ['nvidia/nemotron-3-ultra-550b-a55b', 'nvidia/nemotron-3.5-lightning-30b-a3b']
export const AUDIT_DEFAULTS = { maxPerRun: 8, maxPerEditionRun: 25, lookbackHours: 48, maxAttempts: 2 }
const OPEN_EDITIONS = ['draft', 'in_review', 'approved', 'failed']

export type AuditRow = {
  id: string
  cluster_id: string
  kind: 'analise' | 'sintese_semanal' | 'sintese_mensal'
  status: string
  provider: string
  model: string
  prompt_version: string
  input_hash: string
  editorial_title: string
  summary: string
  what_happened: string
  memorize: string[]
  consequences: { confirmados?: string[]; projecoes?: string[] } | null
  questions: { enunciado: string; alternativas: Record<string, string>; gabarito: string; comentario: string }[]
  content: Record<string, unknown> | null
  validation_errors: { avisos?: string[]; erros?: string[] } | null
  period_meta: { timeline?: { data: string; fato: string }[]; input_sources?: AnalysisSource[] } | null
  audit_status: string
  audit_report: { attempts?: number; flagged_review?: boolean } | null
  generated_at: string
}
const COLS = 'id, cluster_id, kind, status, provider, model, prompt_version, input_hash, editorial_title, summary, what_happened, memorize, consequences, questions, content, validation_errors, period_meta, audit_status, audit_report, generated_at'

export function auditTarget(a: Pick<AuditRow, 'editorial_title' | 'summary' | 'what_happened' | 'memorize' | 'consequences' | 'questions' | 'period_meta'>): AuditTarget {
  return {
    title: a.editorial_title,
    summary: a.summary,
    whatHappened: a.what_happened,
    memorize: a.memorize ?? [],
    confirmed: a.consequences?.confirmados ?? [],
    timeline: (a.period_meta?.timeline ?? []).map((t) => `${t.data}: ${t.fato}`),
    questions: (a.questions ?? []).map((q) => ({ statement: q.enunciado, correct: q.alternativas?.[q.gabarito] ?? '', comment: q.comentario })),
  }
}

const MAX_CORRECTION_ROUNDS = 2
const correctionRound = (row: Pick<AuditRow, 'content'>) => {
  const c = row.content?.corrigida_pela_auditoria as { rodada?: number } | undefined
  return c ? (c.rodada ?? 1) : 0
}

/** Aviso da validação que já manda o assunto para revisão humana (independe da auditoria). */
const reviewWarning = (w: string) => w.includes('sem origem') || w.startsWith('nome não encontrado')

/**
 * Auditoria de veracidade. Ordem: sínteses recém-criadas → textos das edições ainda abertas → demais análises
 * recentes. Reprovada: o assunto vai para revisão e (análise da IA, uma vez) o redator recebe os problemas e
 * corrige; a versão corrigida é auditada de novo. Nada reprovado entra no PDF (render confere).
 * Payload opcional: { analysisIds: [], maxCalls, stage: 'edicao' (sem teto baixo: audita tudo das edições abertas) }.
 */
export async function auditJob(job: { id: string; payload: Record<string, unknown> }, ctx: JobContext, deps?: { ai?: AIClient }) {
  if (!deps?.ai && !ctx.config.NVIDIA_API_KEY) {
    ctx.log.warn('auditoria: NVIDIA_API_KEY ausente — etapa ignorada')
    return { skipped: 'sem chave de IA' }
  }
  const get = await loadSettings(ctx)
  if (get<boolean>('audit.enabled', true) === false) return { skipped: 'auditoria desligada nas configurações' }
  const models = get<{ audit?: string[]; analysis?: string[] }>('ai.models', {})
  const auditModels = models.audit?.length ? models.audit : DEFAULT_AUDIT_MODELS
  const writerModels = models.analysis?.length ? models.analysis : DEFAULT_ANALYSIS_MODELS
  const autoCorrect = get<boolean>('audit.auto_correct', true) !== false
  const editionStage = job.payload.stage === 'edicao' || job.payload.stage === 'pdf'
  const configured = Number(get('audit.max_per_run', AUDIT_DEFAULTS.maxPerRun))
  const maxCalls = Math.max(1, Math.min(editionStage ? AUDIT_DEFAULTS.maxPerEditionRun : configured, Number(job.payload.maxCalls ?? Infinity) || Infinity))
  const ai = deps?.ai ?? aiClient(nvidiaProvider({ apiKey: ctx.config.NVIDIA_API_KEY!, baseUrl: ctx.config.NVIDIA_BASE_URL }), dbUsageStore(ctx.db), { dailyBudget: Number(get('ai.daily_call_budget', 120)) })
  const jobId = job.id === 'direto' ? null : job.id

  const queue = await pendingQueue(ctx, job.payload)
  const stats = { pending: queue.length, aprovada: 0, reprovada: 0, erro: 0, reused: 0, corrected: 0, calls: 0, stopped: null as string | null, details: [] as Record<string, unknown>[] }
  const done = new Set<string>()
  while (queue.length) {
    const id = queue.shift()!
    if (done.has(id)) continue
    done.add(id)
    if (stats.calls >= maxCalls) {
      stats.stopped = `limite por rodada (${maxCalls} chamadas)`
      break
    }
    const { data: a, error } = await ctx.db.from('news_analyses').select(COLS).eq('id', id).maybeSingle()
    if (error) throw new Error(`análise: ${error.message}`)
    if (!a || !['valid', 'edited'].includes(a.status)) continue
    const row = a as unknown as AuditRow

    let input: AnalysisInput | null = null
    let sources: AnalysisSource[] = []
    if (row.kind === 'analise') {
      input = await loadClusterInput(ctx, row.cluster_id)
      sources = input?.sources ?? []
    } else sources = row.period_meta?.input_sources ?? []
    if (!sources.length) {
      await save(ctx, row.id, 'erro', { attempts: AUDIT_DEFAULTS.maxAttempts, problems: ['sem fontes para conferir'] }, null, null)
      stats.erro++
      continue
    }
    const target = auditTarget(row)
    const hash = auditHash(target, sources)

    // Mesmo texto + mesmas fontes já auditados (ex.: versão copiada): reaproveita o resultado
    const { data: same } = await ctx.db.from('news_analyses').select('audit_status, audit_report, audit_model').eq('audit_hash', hash).in('audit_status', ['aprovada', 'reprovada']).neq('id', row.id).limit(1).maybeSingle()
    if (same) {
      await save(ctx, row.id, same.audit_status, { ...(same.audit_report ?? {}), reused: true }, same.audit_model, hash)
      stats.reused++
      if (same.audit_status === 'aprovada') stats.aprovada++
      else stats.reprovada++
      continue
    }

    let report: AuditReport
    let auditModel: string
    try {
      const r = await ai.chat(auditModels, { messages: buildAuditMessages(target, sources), maxTokens: 6000, temperature: 0, timeoutMs: 170_000 }, { task: 'audit', jobId })
      stats.calls++
      auditModel = r.model
      try {
        report = judge(r.text, sources, target, Number(row.generated_at.slice(0, 4)))
      } catch (e) {
        await ai.markInvalid(r, 'audit', jobId, (e as Error).message)
        const attempts = (row.audit_report?.attempts ?? 0) + 1
        await save(ctx, row.id, 'erro', { attempts, problems: [(e as Error).message] }, r.model, null)
        stats.erro++
        continue
      }
    } catch (e) {
      if (e instanceof AIError && e.kind === 'budget') {
        stats.stopped = e.message
        break
      }
      stats.calls++
      ctx.log.warn('auditoria: falha na IA', { analysis: row.id, error: (e as Error).message })
      await save(ctx, row.id, 'erro', { attempts: (row.audit_report?.attempts ?? 0) + 1, problems: [`falha na IA: ${(e as Error).message.slice(0, 200)}`] }, null, null)
      stats.erro++
      continue
    }

    await save(ctx, row.id, report.status, { ...report, attempts: (row.audit_report?.attempts ?? 0) + 1, prompt_version: AUDIT_PROMPT_VERSION }, auditModel, hash)
    stats.details.push({ analysis: row.id, kind: row.kind, status: report.status, claims: report.summary.total, problems: report.problems.length })
    ctx.log.info('auditoria', { analysis: row.id, kind: row.kind, status: report.status, ...report.summary })

    if (report.status === 'aprovada') {
      stats.aprovada++
      // Aprovada depois de uma reprovação (versão corrigida ou nova rodada): o assunto sai da revisão
      // que a própria auditoria tinha pedido (se a validação não apontou outro motivo)
      if (row.kind === 'analise' && (row.content?.corrigida_pela_auditoria || row.audit_report?.flagged_review) && !(row.validation_errors?.avisos ?? []).some(reviewWarning))
        await ctx.db.from('news_clusters').update({ needs_review: false }).eq('id', row.cluster_id).eq('needs_review', true)
      continue
    }
    stats.reprovada++
    if (row.kind === 'analise') {
      await ctx.db.from('news_clusters').update({ needs_review: true }).eq('id', row.cluster_id)
      await ctx.db.from('news_analyses').update({ audit_report: { ...report, attempts: (row.audit_report?.attempts ?? 0) + 1, prompt_version: AUDIT_PROMPT_VERSION, flagged_review: true } }).eq('id', row.id)
    }

    // Correção automática: só texto da IA (o editado por pessoa vai para revisão), até 2 rodadas por assunto
    if (!autoCorrect || row.kind !== 'analise' || row.status !== 'valid' || correctionRound(row) >= MAX_CORRECTION_ROUNDS || !input) continue
    if (stats.calls >= maxCalls) continue
    try {
      const fixedId = await correct(ctx, ai, writerModels, row, input, report, jobId)
      stats.calls += fixedId.calls
      if (fixedId.id) {
        stats.corrected++
        queue.unshift(fixedId.id) // audita a versão corrigida na sequência
      }
    } catch (e) {
      if (e instanceof AIError && e.kind === 'budget') {
        stats.stopped = e.message
        break
      }
      ctx.log.warn('auditoria: correção falhou', { analysis: row.id, error: (e as Error).message })
    }
  }
  return { ...stats, models: auditModels, remaining_budget: await ai.remaining() }
}

async function save(ctx: JobContext, id: string, status: string, report: Record<string, unknown>, model: string | null, hash: string | null) {
  const { error } = await ctx.db.from('news_analyses').update({ audit_status: status, audit_report: report, audit_model: model, audit_hash: hash, audited_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(`gravar auditoria: ${error.message}`)
}

/** Fila: sínteses pendentes → itens das edições abertas → análises recentes (por relevância do assunto). */
async function pendingQueue(ctx: JobContext, payload: Record<string, unknown>): Promise<string[]> {
  if (Array.isArray(payload.analysisIds)) return payload.analysisIds.filter((x): x is string => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x))
  const retry = (r: { audit_status: string; audit_report: { attempts?: number } | null }) => r.audit_status === 'pendente' || (r.audit_report?.attempts ?? 0) < AUDIT_DEFAULTS.maxAttempts
  const since = new Date(Date.now() - AUDIT_DEFAULTS.lookbackHours * 3_600_000).toISOString()

  const { data: synth, error: e1 } = await ctx.db.from('news_analyses').select('id, audit_status, audit_report').neq('kind', 'analise').in('status', ['valid', 'edited']).in('audit_status', ['pendente', 'erro']).gte('generated_at', since).order('generated_at')
  if (e1) throw new Error(`sínteses: ${e1.message}`)
  const { data: items, error: e2 } = await ctx.db
    .from('edition_items')
    .select('block, position, editions!inner(status, reference_date), news_analyses!inner(id, status, audit_status, audit_report)')
    .in('editions.status', OPEN_EDITIONS)
    .in('news_analyses.status', ['valid', 'edited'])
    .in('news_analyses.audit_status', ['pendente', 'erro'])
    .limit(500)
  if (e2) throw new Error(`itens das edições: ${e2.message}`)
  type It = { block: string; position: number; editions: { reference_date: string }; news_analyses: { id: string; audit_status: string; audit_report: { attempts?: number } | null } }
  const blockOrder = { estado: 0, nacional: 1, internacional: 2 } as Record<string, number>
  const its = ((items ?? []) as unknown as It[]).sort((a, b) => a.editions.reference_date.localeCompare(b.editions.reference_date) || blockOrder[a.block] - blockOrder[b.block] || a.position - b.position)
  const { data: recent, error: e3 } = await ctx.db
    .from('news_analyses')
    .select('id, audit_status, audit_report, news_clusters!inner(relevance_score, needs_review)')
    .eq('kind', 'analise')
    .in('status', ['valid', 'edited'])
    .in('audit_status', ['pendente', 'erro'])
    .gte('generated_at', since)
    .limit(200)
  if (e3) throw new Error(`análises recentes: ${e3.message}`)
  type Rc = { id: string; audit_status: string; audit_report: { attempts?: number } | null; news_clusters: { relevance_score: number | null; needs_review: boolean } }
  const rc = ((recent ?? []) as unknown as Rc[]).sort((a, b) => Number(a.news_clusters.needs_review) - Number(b.news_clusters.needs_review) || (b.news_clusters.relevance_score ?? 0) - (a.news_clusters.relevance_score ?? 0))
  const ids = [...(synth ?? []).filter(retry).map((r) => r.id), ...its.map((i) => i.news_analyses).filter(retry).map((r) => r.id), ...rc.filter(retry).map((r) => r.id)]
  return [...new Set(ids)]
}

/**
 * O redator recebe a própria análise e a lista de problemas da auditoria e reescreve só esses pontos.
 * A nova versão passa pela validação de sempre; válida, substitui a anterior (inclusive nas edições abertas).
 */
async function correct(ctx: JobContext, ai: AIClient, models: string[], row: AuditRow, input: AnalysisInput, report: AuditReport, jobId: string | null): Promise<{ id: string | null; calls: number }> {
  const original = JSON.stringify(row.content ?? {}).slice(0, 12_000)
  const messages = [
    ...buildMessages(input),
    { role: 'assistant' as const, content: original },
    {
      role: 'user' as const,
      content: `A auditoria de fatos conferiu o texto com as FONTES e encontrou problemas:\n- ${report.problems.slice(0, 12).join('\n- ')}\nCorrija SOMENTE esses pontos: ajuste ao que as fontes dizem ou remova a afirmação. Não acrescente informação nova. Mantenha o resto. Responda só com o JSON completo.`,
    },
  ]
  const preferred = [row.model, ...models.filter((m) => m !== row.model)]
  let r = await ai.chat(preferred, { messages, maxTokens: 3500, temperature: 0.1, timeoutMs: 150_000 }, { task: 'analysis_audit_fix', jobId })
  let v = validateAnalysis(r.text, input)
  let calls = 1
  if (!v.ok) {
    // A correção também passa pela validação de sempre (ex.: cópia literal da fonte): uma nova tentativa com os erros
    await ai.markInvalid(r, 'analysis_audit_fix', jobId, v.errors.join(' | '))
    const retry = [...messages, { role: 'assistant' as const, content: r.text.slice(0, 12_000) }, { role: 'user' as const, content: `A correção violou as regras:\n- ${v.errors.join('\n- ')}\nReescreva o JSON completo com suas palavras — inclusive os trechos que já estavam no texto anterior —, sem copiar frases das fontes e sem números fora delas. Responda só com o JSON.` }]
    // Segunda tentativa com o outro modelo redator (o primeiro tende a repetir o mesmo erro)
    const other = preferred.find((m) => m !== r.model) ?? r.model
    r = await ai.chat([other, r.model], { messages: retry, maxTokens: 3500, temperature: 0.1, timeoutMs: 150_000 }, { task: 'analysis_audit_fix', jobId })
    calls++
    v = validateAnalysis(r.text, input)
    if (!v.ok) {
      await ai.markInvalid(r, 'analysis_audit_fix', jobId, v.errors.join(' | '))
      return { id: null, calls }
    }
  }
  const base = toAnalysisRow(v.data, input)
  await ctx.db.from('news_analyses').update({ status: 'superseded' }).eq('id', row.id)
  const { data: created, error } = await ctx.db
    .from('news_analyses')
    .insert({
      ...base,
      content: { ...base.content, corrigida_pela_auditoria: { de: row.id, rodada: correctionRound(row) + 1, problemas: report.problems.slice(0, 12) } },
      cluster_id: row.cluster_id,
      provider: r.provider,
      model: r.model,
      prompt_version: row.prompt_version,
      input_hash: row.input_hash,
      status: 'valid',
      kind: 'analise',
      validation_errors: { avisos: [...v.warnings, 'corrigida pela auditoria de veracidade'] },
    })
    .select('id')
    .single()
  if (error || !created) {
    await ctx.db.from('news_analyses').update({ status: 'valid' }).eq('id', row.id) // desfaz
    throw new Error(`gravar correção: ${error?.message}`)
  }
  const { data: eds } = await ctx.db.from('editions').select('id').in('status', OPEN_EDITIONS)
  if (eds?.length) await ctx.db.from('edition_items').update({ analysis_id: created.id }).eq('analysis_id', row.id).in('edition_id', eds.map((e) => e.id))
  ctx.log.info('análise corrigida após auditoria', { de: row.id, para: created.id })
  return { id: created.id, calls }
}
