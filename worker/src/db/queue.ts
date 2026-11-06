import type { SupabaseClient } from '@supabase/supabase-js'

export const JOB_TYPES = ['healthcheck', 'collect', 'triage', 'cluster', 'verify', 'analyze', 'audit', 'review', 'synthesize', 'compose', 'render', 'personalize', 'deliver', 'cleanup'] as const
export type JobType = (typeof JOB_TYPES)[number]

export type Job = {
  id: string
  job_type: JobType
  payload: Record<string, unknown>
  attempts: number
  max_attempts: number
}

/** Fila de tarefas no Postgres (processing_jobs + claim_jobs/finish_job). */
export interface Queue {
  enqueue(type: JobType, payload?: Record<string, unknown>, opts?: { dedupeKey?: string; priority?: number; runAfter?: Date }): Promise<'queued' | 'duplicate'>
  claim(workerId: string, types: JobType[] | null, limit: number): Promise<Job[]>
  finish(id: string, ok: boolean, error?: string | null, result?: unknown): Promise<void>
}

export function postgresQueue(db: SupabaseClient): Queue {
  return {
    async enqueue(type, payload = {}, opts = {}) {
      const { error } = await db.from('processing_jobs').insert({
        job_type: type,
        payload,
        dedupe_key: opts.dedupeKey ?? null,
        priority: opts.priority ?? 5,
        run_after: (opts.runAfter ?? new Date()).toISOString(),
      })
      if (error?.code === '23505') return 'duplicate' // dedupe_key já existe: idempotente
      if (error) throw new Error(`enqueue: ${error.message}`)
      return 'queued'
    },
    async claim(workerId, types, limit) {
      const { data, error } = await db.rpc('claim_jobs', { p_worker: workerId, p_types: types, p_limit: limit })
      if (error) throw new Error(`claim_jobs: ${error.message}`)
      return (data ?? []) as Job[]
    },
    async finish(id, ok, error = null, result = null) {
      const { error: e } = await db.rpc('finish_job', { p_id: id, p_ok: ok, p_error: error, p_result: result })
      if (e) throw new Error(`finish_job: ${e.message}`)
    },
  }
}
