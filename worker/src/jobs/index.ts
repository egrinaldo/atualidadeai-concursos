import type { JobType } from '../db/queue.ts'
import { collect } from './collect.ts'
import { healthcheck } from './healthcheck.ts'
import type { JobHandler } from './types.ts'

/** Registro dos tipos de tarefa implementados (os demais chegam nas próximas subetapas). */
export const handlers: Partial<Record<JobType, JobHandler>> = {
  healthcheck,
  collect,
}
