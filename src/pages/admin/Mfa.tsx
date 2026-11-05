import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Alert } from '@/components/forms/Alert'
import { TextField } from '@/components/forms/Field'
import { Button, Icon } from '@/components/ui'
import { getSupabase } from '@/lib/supabase'

/**
 * Segundo fator (TOTP) obrigatório para o painel administrativo.
 * A exigência real está no servidor (função "admin" recusa sessão sem aal2);
 * esta tela só conduz o cadastro e a verificação do código.
 */
type State =
  | { step: 'loading' }
  | { step: 'ok' }
  | { step: 'verify'; factorId: string }
  | { step: 'enroll'; factorId: string; qr: string; secret: string }
  | { step: 'error'; message: string }

export function MfaGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ step: 'loading' })
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void start()
  }, [])

  async function start() {
    const mfa = getSupabase().auth.mfa
    const { data: aal, error: aalErr } = await mfa.getAuthenticatorAssuranceLevel()
    if (aalErr) return setState({ step: 'error', message: 'Não foi possível verificar a segurança da sessão. Entre novamente.' })
    if (aal.currentLevel === 'aal2') return setState({ step: 'ok' })

    const { data: factors } = await mfa.listFactors()
    const verified = factors?.totp.find((f) => f.status === 'verified')
    if (verified) return setState({ step: 'verify', factorId: verified.id })

    // Remove cadastros incompletos anteriores antes de gerar um novo QR code
    for (const f of factors?.all ?? []) if (f.status !== 'verified') await mfa.unenroll({ factorId: f.id })
    const { data, error: enrollErr } = await mfa.enroll({ factorType: 'totp', friendlyName: `Painel ${new Date().toISOString().slice(0, 10)}` })
    if (enrollErr || !data) return setState({ step: 'error', message: 'Não foi possível iniciar o cadastro do autenticador. Tente novamente.' })
    setState({ step: 'enroll', factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (state.step !== 'verify' && state.step !== 'enroll') return
    if (!/^\d{6}$/.test(code)) return setError('Digite os 6 números exibidos no aplicativo.')
    setBusy(true)
    setError(null)
    const { error: vErr } = await getSupabase().auth.mfa.challengeAndVerify({ factorId: state.factorId, code })
    setBusy(false)
    if (vErr) {
      setCode('')
      return setError('Código incorreto ou expirado. Confira o horário do celular e tente o código atual.')
    }
    setState({ step: 'ok' })
  }

  if (state.step === 'ok') return <>{children}</>

  if (state.step === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Carregando">
        <span className="size-8 animate-spin rounded-full border-2 border-brand-400/30 border-t-brand-400" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-navy-900/85 p-6 sm:p-8">
        <Icon name="shield" className="size-9 text-brand-300" />
        {state.step === 'error' ? (
          <>
            <h1 className="mt-4 text-2xl font-bold">Verificação indisponível</h1>
            <Alert tone="error" className="mt-4">
              {state.message}
            </Alert>
            <Button href="/entrar" className="mt-6 w-full">
              Entrar novamente
            </Button>
          </>
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            <div>
              <h1 className="mt-4 text-2xl font-bold">{state.step === 'enroll' ? 'Ative a verificação em duas etapas' : 'Verificação em duas etapas'}</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {state.step === 'enroll'
                  ? 'O painel exige um código do aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password…). Escaneie o QR code e digite o código gerado.'
                  : 'Digite o código de 6 números exibido no seu aplicativo autenticador.'}
              </p>
            </div>
            {state.step === 'enroll' && (
              <div className="space-y-3 text-center">
                <img src={state.qr} alt="QR code para cadastrar o autenticador" className="mx-auto size-48 rounded-xl bg-white p-2" />
                <p className="text-xs text-slate-400">
                  Não consegue escanear? Digite a chave no aplicativo:
                  <code className="mt-1 block break-all rounded-lg bg-navy-950/70 px-3 py-2 font-mono text-sm text-slate-200">{state.secret}</code>
                </p>
              </div>
            )}
            {error && <Alert tone="error">{error}</Alert>}
            <TextField
              label="Código de verificação"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
            <Button type="submit" size="lg" className="w-full" disabled={busy} aria-busy={busy}>
              {busy ? 'Verificando…' : 'Confirmar'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
