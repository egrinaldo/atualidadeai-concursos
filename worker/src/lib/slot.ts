import { brtDate, referenceDateFor } from '../pdf/edition.ts'

/** Etapas ligadas à PUBLICAÇÃO do dia (06h): a vaga é a data de hoje em Brasília, não a da próxima edição. */
const PUBLICATION_STEPS = new Set(['deliver', 'cleanup', 'healthcheck'])

/**
 * Vaga (chave de idempotência) de uma rodada do `tick`.
 * - "edition": montagem/geração usam a data da edição que está sendo preparada (depois do meio-dia = amanhã);
 *   publicação/limpeza/verificação usam a data de HOJE. Antes de 08/11/2026 tudo usava a data da edição: um
 *   disparo atrasado do GitHub ao meio-dia de 07/11 ocupou a vaga do envio de 08/11, que foi descartado.
 * - "manual": sempre uma rodada nova.
 * - padrão: janela de 3h.
 */
export function tickSlot(mode: string | undefined, type: string, now: Date): string {
  if (mode === 'edition') return `ed-${PUBLICATION_STEPS.has(type) ? brtDate(now) : referenceDateFor(now)}`
  if (mode === 'manual') return `m-${now.toISOString()}`
  return `${now.toISOString().slice(0, 10)}T${String(Math.floor(now.getUTCHours() / 3) * 3).padStart(2, '0')}`
}

/** Uma rodada que terminou sem efeito (ex.: "antes das 06h", nada pronto) não ocupa a vaga: pode rodar de novo. */
export function isNoop(job: { status: string; result: unknown } | null | undefined): boolean {
  return job?.status === 'succeeded' && typeof job.result === 'object' && job.result !== null && (job.result as { noop?: unknown }).noop === true
}
