import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Cloudflare Turnstile (proteção contra robôs) no cadastro, login e recuperação de senha.
 * Ligado só quando existe VITE_TURNSTILE_SITE_KEY; sem a chave, nada muda (o Supabase Auth também precisa
 * estar com o CAPTCHA ligado — ativar os DOIS juntos, ver docs/OPERACAO.md).
 * O token vale para UMA tentativa: depois de cada envio, `reset()` pede um novo.
 */
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? ''
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (id: string) => void
  remove: (id: string) => void
}
declare global {
  interface Window {
    turnstile?: Turnstile
  }
}

let loading: Promise<void> | null = null
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      loading = null
      reject(new Error('turnstile'))
    }
    document.head.appendChild(s)
  })
  return loading
}

export function useCaptcha(): { required: boolean; token: string | null; widget: ReactNode; reset: () => void; missingMessage: string } {
  const box = useRef<HTMLDivElement>(null)
  const id = useRef<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!SITE_KEY) return
    let alive = true
    loadScript()
      .then(() => {
        if (!alive || !box.current || !window.turnstile || id.current) return
        id.current = window.turnstile.render(box.current, {
          sitekey: SITE_KEY,
          language: 'pt-br',
          theme: 'dark',
          callback: (t: string) => setToken(t),
          'expired-callback': () => setToken(null),
          'error-callback': () => setToken(null),
        })
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
      if (id.current && window.turnstile) window.turnstile.remove(id.current)
      id.current = null
    }
  }, [])

  const reset = useCallback(() => {
    setToken(null)
    if (id.current && window.turnstile) window.turnstile.reset(id.current)
  }, [])

  const widget = SITE_KEY ? (
    <div className="flex min-h-[65px] flex-col items-center justify-center">
      <div ref={box} />
      {failed && <p className="text-xs text-red-200">Não foi possível carregar a verificação anti-robô. Recarregue a página.</p>}
    </div>
  ) : null

  return { required: !!SITE_KEY, token, widget, reset, missingMessage: 'Aguarde a verificação anti-robô (caixa acima do botão) e tente de novo.' }
}
