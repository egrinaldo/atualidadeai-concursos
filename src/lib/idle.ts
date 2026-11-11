/**
 * Encerramento da sessão por inatividade (11/11/2026).
 *
 * O Supabase renova o token sozinho e, sem isto, o usuário ficava conectado por tempo indeterminado.
 * Regra: sem uso do site por IDLE_MINUTES (mouse, teclado, toque, rolagem), a sessão é encerrada neste navegador
 * e a pessoa volta para /entrar com o aviso de inatividade. O horário da última atividade fica no localStorage,
 * então vale entre abas e também ao reabrir o navegador depois de horas.
 */
export const IDLE_MINUTES = 60
const IDLE_MS = IDLE_MINUTES * 60_000
const KEY = 'aai:ultima-atividade'

function read(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

/** Registra atividade agora. */
export function touchActivity(now = Date.now()): void {
  try {
    localStorage.setItem(KEY, String(now))
  } catch {
    /* sem armazenamento: a verificação usa só o tempo desta aba */
  }
}

export function clearActivity(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignora */
  }
}

/** true se a última atividade registrada passou do limite. Sem registro: não expira (e passa a registrar). */
export function isIdleExpired(now = Date.now(), last = read()): boolean {
  return last != null && now - last > IDLE_MS
}

const EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove', 'focus'] as const

/** Escuta atividade (com no máximo 1 gravação a cada 30 s) e chama onExpire quando passar do limite. */
export function watchIdle(onExpire: () => void): () => void {
  let lastWrite = 0
  const onActivity = () => {
    const now = Date.now()
    if (isIdleExpired(now)) return onExpire() // voltou depois do limite (ex.: aba em segundo plano)
    if (now - lastWrite > 30_000) {
      lastWrite = now
      touchActivity(now)
    }
  }
  const timer = window.setInterval(() => {
    if (isIdleExpired()) onExpire()
  }, 30_000)
  const onVisible = () => document.visibilityState === 'visible' && isIdleExpired() && onExpire()
  for (const e of EVENTS) window.addEventListener(e, onActivity, { passive: true })
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    window.clearInterval(timer)
    for (const e of EVENTS) window.removeEventListener(e, onActivity)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
