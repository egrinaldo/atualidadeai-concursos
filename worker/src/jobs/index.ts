import type { JobType } from '../db/queue.ts'
import { clusterJob } from './cluster.ts'
import { collect } from './collect.ts'
import { healthcheck } from './healthcheck.ts'
import { triageJob } from './triage.ts'
import type { JobHandler } from './types.ts'

/** Registro dos tipos de tarefa implementados (os demais chegam nas próximas subetapas). */
export const handlers: Partial<Record<JobType, JobHandler>> = {
  healthcheck,
  collect,
  triage: triageJob,
  cluster: clusterJob,
}
