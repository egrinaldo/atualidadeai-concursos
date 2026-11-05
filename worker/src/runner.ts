import type { Job, JobType, Queue } from './db/queue.ts'
import type { JobContext, JobHandler } from './jobs/types.ts'

/**
 * Processa tarefas da fila até esvaziar ou atingir o limite.
 * Uma falha numa tarefa não derruba o worker: é registrada e reagendada
 * (espera exponencial no banco) até o máximo de tentativas.
 */
export async function runQueue(
  ctx: JobContext,
  queue: Queue,
  handlers: Partial<Record<JobType, JobHandler>>,
  opts: { types: JobType[] | null; maxJobs: number; batch?: number },
) {
  const summary = { processed: 0, succeeded: 0, failed: 0 }
  while (summary.processed < opts.maxJobs) {
    const jobs: Job[] = await queue.claim(ctx.config.workerId, opts.types, Math.min(opts.batch ?? 5, opts.maxJobs - summary.processed))
    if (jobs.length === 0) break
    for (const job of jobs) {
      summary.processed++
      const log = ctx.log.child({ job: job.id, type: job.job_type, attempt: job.attempts })
      const handler = handlers[job.job_type]
      const started = Date.now()
      try {
        if (!handler) throw new Error(`tipo de tarefa sem implementação: ${job.job_type}`)
        const result = await handler(job, { ...ctx, log })
        await queue.finish(job.id, true, null, { ...(result ?? {}), duration_ms: Date.now() - started })
        summary.succeeded++
        log.info('tarefa concluída', { duration_ms: Date.now() - started })
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        await queue.finish(job.id, false, message)
        summary.failed++
        log.error('tarefa falhou', { error: message })
      }
    }
  }
  return summary
}
