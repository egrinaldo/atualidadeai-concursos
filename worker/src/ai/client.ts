import type { SupabaseClient } from '@supabase/supabase-js'
import { AIError, type AIProvider, type ChatRequest, type ChatResult } from './types.ts'

export type UsageRow = {
  provider: string
  model: string
  task: string
  job_id: string | null
  prompt_tokens: number | null
  completion_tokens: number | null
  total_tokens: number | null
  latency_ms: number | null
  status: 'ok' | 'error' | 'timeout' | 'rate_limited' | 'invalid_output'
  http_status: number | null
  error: string | null
}

/** Onde o uso é contado e registrado (ai_usage_logs no banco; memória nos testes). */
export interface UsageStore {
  callsToday(): Promise<number>
  log(row: UsageRow): Promise<void>
}

/** Início do dia em Brasília (UTC−3, sem horário de verão) em ISO. */
export function startOfDayBrasilia(now = new Date()): string {
  const local = new Date(now.getTime() - 3 * 3_600_000)
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + 3 * 3_600_000).toISOString()
}

export function dbUsageStore(db: SupabaseClient): UsageStore {
  return {
    async callsToday() {
      const { count, error } = await db.from('ai_usage_logs').select('id', { count: 'exact', head: true }).gte('created_at', startOfDayBrasilia()).neq('status', 'invalid_output') // saída inválida não é chamada nova
      if (error) throw new Error(`uso de IA: ${error.message}`)
      return count ?? 0
    },
    async log(row) {
      const { error } = await db.from('ai_usage_logs').insert({ ...row, error: row.error?.slice(0, 1000) ?? null })
      if (error) throw new Error(`registro de uso de IA: ${error.message}`)
    },
  }
}

/**
 * Cliente de IA: respeita a cota diária (toda tentativa conta), registra cada chamada
 * e passa para o próximo modelo da lista quando um falha (indisponível, limite, tempo esgotado).
 */
export function aiClient(provider: AIProvider, usage: UsageStore, opts: { dailyBudget: number }) {
  async function ensureBudget() {
    const used = await usage.callsToday()
    if (used >= opts.dailyBudget) throw new AIError(`cota diária de IA atingida (${used}/${opts.dailyBudget})`, 'budget')
    return opts.dailyBudget - used
  }
  return {
    provider: provider.name,
    remaining: async () => Math.max(0, opts.dailyBudget - (await usage.callsToday())),
    /** Registra uma saída inválida (falha de validação) já contabilizada como chamada ok. */
    async markInvalid(result: ChatResult, task: string, jobId: string | null, reason: string) {
      await usage.log({ provider: result.provider, model: result.model, task, job_id: jobId, prompt_tokens: null, completion_tokens: null, total_tokens: null, latency_ms: null, status: 'invalid_output', http_status: null, error: reason })
    },
    async chat(models: string[], req: ChatRequest, ctx: { task: string; jobId: string | null }): Promise<ChatResult> {
      if (!models.length) throw new AIError('nenhum modelo configurado', 'error')
      let last: AIError | null = null
      for (const model of models) {
        await ensureBudget()
        try {
          const r = await provider.chat(model, req)
          await usage.log({ provider: r.provider, model, task: ctx.task, job_id: ctx.jobId, prompt_tokens: r.usage.prompt, completion_tokens: r.usage.completion, total_tokens: r.usage.total, latency_ms: r.latencyMs, status: 'ok', http_status: 200, error: null })
          return r
        } catch (e) {
          const err = e instanceof AIError ? e : new AIError(String((e as Error)?.message ?? e), 'error')
          const status = err.kind === 'timeout' ? 'timeout' : err.kind === 'rate_limited' ? 'rate_limited' : 'error'
          await usage.log({ provider: provider.name, model, task: ctx.task, job_id: ctx.jobId, prompt_tokens: null, completion_tokens: null, total_tokens: null, latency_ms: null, status, http_status: err.httpStatus ?? null, error: err.message })
          last = err
          if (!err.tryNext) throw err
        }
      }
      throw last ?? new AIError('falha em todos os modelos', 'error')
    },
  }
}
export type AIClient = ReturnType<typeof aiClient>
