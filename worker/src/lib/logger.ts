/**
 * Log estruturado (uma linha JSON por evento) com remoção de segredos.
 * Nunca registra chaves, tokens, senhas ou cabeçalhos de autorização.
 */
type Level = 'debug' | 'info' | 'warn' | 'error'
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

const SECRET_KEY = /(key|token|secret|password|senha|authorization|apikey|cookie)/i
const SECRET_VALUE = /(nvapi-[\w-]{8,}|sb_secret_[\w-]{8,}|sbp_[a-f0-9]{16,}|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}|(APP_USR|TEST)-[\w-]{10,}|re_[A-Za-z0-9]{8,}_[A-Za-z0-9]{6,}|postgres(ql)?:\/\/[^\s]+)/g

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[…]'
  if (typeof value === 'string') return value.replace(SECRET_VALUE, '[redigido]').slice(0, 2000)
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1))
  if (value instanceof Error) return { name: value.name, message: redact(value.message, depth + 1) }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEY.test(k) ? '[redigido]' : redact(v, depth + 1)
    return out
  }
  return value
}

export function createLogger(minLevel: Level = 'info', base: Record<string, unknown> = {}, sink: (line: string) => void = console.log) {
  const log = (level: Level, msg: string, data?: Record<string, unknown>) => {
    if (order[level] < order[minLevel]) return
    sink(JSON.stringify({ t: new Date().toISOString(), level, msg: redact(msg), ...(redact({ ...base, ...data }) as object) }))
  }
  return {
    debug: (m: string, d?: Record<string, unknown>) => log('debug', m, d),
    info: (m: string, d?: Record<string, unknown>) => log('info', m, d),
    warn: (m: string, d?: Record<string, unknown>) => log('warn', m, d),
    error: (m: string, d?: Record<string, unknown>) => log('error', m, d),
    child: (extra: Record<string, unknown>) => createLogger(minLevel, { ...base, ...extra }, sink),
  }
}
export type Logger = ReturnType<typeof createLogger>
