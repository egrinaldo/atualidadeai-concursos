import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Config } from '../src/config.ts'
import type { Job, Queue } from '../src/db/queue.ts'
import { createLogger } from '../src/lib/logger.ts'
import { runQueue } from '../src/runner.ts'

function fakeQueue(jobs: Job[]) {
  const finished: { id: string; ok: boolean; error?: string | null }[] = []
  const queue: Queue = {
    enqueue: async () => 'queued',
    claim: async (_w, _t, limit) => jobs.splice(0, limit),
    finish: async (id, ok, error) => { finished.push({ id, ok, error }) },
  }
  return { queue, finished }
}
const ctx = { config: { workerId: 'teste' } as Config, db: {} as never, queue: {} as Queue, log: createLogger('error', {}, () => {}) }
const job = (id: string, type: Job['job_type']): Job => ({ id, job_type: type, payload: {}, attempts: 1, max_attempts: 3 })

test('processa a fila, isola falhas e registra o resultado de cada tarefa', async () => {
  const { queue, finished } = fakeQueue([job('1', 'healthcheck'), job('2', 'collect'), job('3', 'healthcheck')])
  let calls = 0
  const summary = await runQueue({ ...ctx, queue }, queue, {
    healthcheck: async () => { calls++; if (calls === 2) throw new Error('falha simulada'); return { ok: true } },
  }, { types: null, maxJobs: 10 })
  assert.deepEqual(summary, { processed: 3, succeeded: 1, failed: 2 })
  assert.equal(finished.find((f) => f.id === '2')?.error, 'tipo de tarefa sem implementação: collect')
  assert.equal(finished.find((f) => f.id === '3')?.error, 'falha simulada')
})

test('respeita o limite máximo de tarefas por execução', async () => {
  const { queue } = fakeQueue([job('1', 'healthcheck'), job('2', 'healthcheck'), job('3', 'healthcheck')])
  const summary = await runQueue({ ...ctx, queue }, queue, { healthcheck: async () => ({}) }, { types: null, maxJobs: 2 })
  assert.equal(summary.processed, 2)
})
