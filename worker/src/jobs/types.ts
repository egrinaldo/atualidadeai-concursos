import type { SupabaseClient } from '@supabase/supabase-js'
import type { Config } from '../config.ts'
import type { Job, Queue } from '../db/queue.ts'
import type { Logger } from '../lib/logger.ts'

export type JobContext = { config: Config; db: SupabaseClient; queue: Queue; log: Logger }
export type JobHandler = (job: Job, ctx: JobContext) => Promise<Record<string, unknown> | void>
