/**
 * Novas tentativas com espera exponencial e variação aleatória (jitter),
 * e limite de tempo por tentativa. Usado para HTTP (fontes e IA).
 */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'HttpError'
  }
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof HttpError) return error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500
  if (error instanceof Error) return error.name === 'TimeoutError' || error.name === 'AbortError' || /ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed/i.test(error.message)
  return false
}

export function backoffMs(attempt: number, baseMs = 1000, maxMs = 30_000, random = Math.random): number {
  const cap = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1))
  return Math.round(cap / 2 + random() * (cap / 2)) // "equal jitter": entre 50% e 100% do teto
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: { retries?: number; baseMs?: number; maxMs?: number; shouldRetry?: (e: unknown) => boolean; onRetry?: (e: unknown, attempt: number, waitMs: number) => void; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const { retries = 3, baseMs = 1000, maxMs = 30_000, shouldRetry = isRetryable, onRetry, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = opts
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt)
    } catch (e) {
      if (attempt > retries || !shouldRetry(e)) throw e
      const wait = backoffMs(attempt, baseMs, maxMs)
      onRetry?.(e, attempt, wait)
      await sleep(wait)
    }
  }
}

/** Sinal de cancelamento por tempo (fetch(url, { signal: timeout(15000) })). */
export const timeout = (ms: number) => AbortSignal.timeout(ms)
