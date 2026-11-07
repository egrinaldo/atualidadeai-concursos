/**
 * Worker do AtualidadeAI Concursos (Etapa 2).
 *
 * Uso:
 *   npm run job -- healthcheck                 executa a verificação direto (sem fila)
 *   npm run job -- enqueue <tipo> [dedupeKey]  coloca uma tarefa na fila
 *   npm run job -- run [tipo,tipo] [máx]       processa a fila
 *   npm run job -- tick <tipo[,tipo]>          enfileira a rodada atual de cada etapa (sem duplicar) e processa em ordem
 */
import { loadConfig } from './config.ts'
import { dbClient } from './db/client.ts'
import { JOB_TYPES, postgresQueue, type JobType } from './db/queue.ts'
import { handlers } from './jobs/index.ts'
import { createLogger } from './lib/logger.ts'
import { referenceDateFor } from './pdf/edition.ts'
import { runQueue } from './runner.ts'

async function main() {
  const [command = 'run', arg1, arg2] = process.argv.slice(2)
  const config = loadConfig()
  const log = createLogger(config.LOG_LEVEL, { worker: config.workerId })
  const db = dbClient(config)
  const queue = postgresQueue(db)
  const ctx = { config, db, queue, log }

  if (command === 'healthcheck') {
    const result = await handlers.healthcheck!({ id: 'direto', job_type: 'healthcheck', payload: {}, attempts: 1, max_attempts: 1 }, ctx)
    log.info('healthcheck ok', { result: result ?? {} })
    return
  }
  if (command === 'enqueue') {
    if (!JOB_TYPES.includes(arg1 as JobType)) throw new Error(`tipo inválido: ${arg1}`)
    const r = await queue.enqueue(arg1 as JobType, {}, { dedupeKey: arg2 })
    log.info('enfileirada', { type: arg1, result: r })
    return
  }
  if (command === 'tick') {
    // Etapas em sequência (ex.: "collect,triage,cluster"); uma rodada por janela de 3h — reexecuções não duplicam.
    // "tipo@etiqueta" separa rodadas do mesmo tipo na mesma janela e chega à tarefa como payload { stage: etiqueta }
    // (ex.: "compose@diaria,synthesize,audit@edicao,compose@periodo").
    const steps = (arg1 ?? '').split(',').filter(Boolean).map((s) => {
      const [type, tag] = s.split('@')
      return { type: type as JobType, tag: tag && /^[a-z]{1,20}$/.test(tag) ? tag : tag ? null : undefined }
    })
    if (!steps.length || steps.some((s) => !JOB_TYPES.includes(s.type) || s.tag === null)) throw new Error(`tipo inválido: ${arg1}`)
    const now = new Date()
    // Janela de idempotência: 3h (padrão); "edition" = dia da edição (disparos agendados das edições, que podem
    // chegar duplicados ou atrasados); "manual" = sempre uma rodada nova
    const mode = process.env.TICK_SLOT
    const slot =
      mode === 'edition' ? `ed-${referenceDateFor(now)}`
      : mode === 'manual' ? `m-${now.toISOString()}`
      : `${now.toISOString().slice(0, 10)}T${String(Math.floor(now.getUTCHours() / 3) * 3).padStart(2, '0')}`
    for (const { type, tag } of steps) {
      const r = await queue.enqueue(type, tag ? { stage: tag } : {}, { dedupeKey: `${type}${tag ? `@${tag}` : ''}:${slot}` })
      log.info('rodada', { type, tag, slot, result: r })
      const summary = await runQueue(ctx, queue, handlers, { types: [type], maxJobs: 5 })
      log.info('fila processada', { type, ...summary })
      if (summary.failed > 0) process.exitCode = 1
    }
    return
  }
  if (command === 'run') {
    const types = arg1 ? (arg1.split(',') as JobType[]) : null
    const summary = await runQueue(ctx, queue, handlers, { types, maxJobs: Number(arg2 ?? 50) })
    log.info('fila processada', summary)
    if (summary.failed > 0) process.exitCode = 1
    return
  }
  throw new Error(`comando desconhecido: ${command}`)
}

main().catch((e) => {
  console.error(JSON.stringify({ level: 'error', msg: e instanceof Error ? e.message.replace(/(nvapi-|sb_secret_|eyJ)[\w.-]+/g, '[redigido]') : String(e) }))
  process.exit(1)
})
