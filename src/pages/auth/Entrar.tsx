import { useEffect, useState, type FormEvent } from 'react'
import { Alert } from '@/components/forms/Alert'
import { PasswordField, TextField } from '@/components/forms/Field'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui'
import { isAdmin } from '@/lib/admin'
import { useCaptcha } from '@/components/forms/Captcha'
import { getSession, resendConfirmation, signIn } from '@/lib/auth'
import { validateEmail } from '@/lib/validation'

/**
 * Só aceita destinos internos (evita redirecionamento aberto).
 * Recusa "//", barra invertida e caracteres de controle — navegadores tratam
 * "/\\site.com" e "/\t/site.com" como endereços externos — e confere a origem final.
 */
export function safeNext(value: string | null): string {
  const fallback = '/conta'
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback
  try {
    const url = new URL(value, window.location.origin)
    if (url.origin !== window.location.origin) return fallback
    return url.pathname + url.search + url.hash
  } catch {
    return fallback
  }
}

/**
 * Destino após o login: o endereço pedido em ?next= ou, sem ele,
 * o painel para administradores e a área do assinante para os demais.
 */
async function destination(requested: string | null): Promise<string> {
  if (requested) return safeNext(requested)
  const session = await getSession()
  return session && (await isAdmin(session.user.id)) ? '/admin' : '/conta'
}

export function Entrar() {
  const params = new URLSearchParams(window.location.search)
  const requested = params.get('next')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [serverError, setServerError] = useState<{ message: string; code?: string } | null>(null)
  const [info, setInfo] = useState<string | null>(params.get('senha') === 'redefinida' ? 'Senha alterada. Entre com a nova senha.' : null)
  const [submitting, setSubmitting] = useState(false)
  const captcha = useCaptcha()

  // Já logado? Vai direto para a área certa (assinante ou administrador).
  useEffect(() => {
    getSession().then(async (s) => s && window.location.replace(await destination(requested)))
  }, [requested])

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    setServerError(null)
    setInfo(null)
    const e = { email: validateEmail(email) ?? undefined, password: password ? undefined : 'Informe sua senha.' }
    setErrors(e)
    if (e.email || e.password) return
    if (captcha.required && !captcha.token) return setServerError({ message: captcha.missingMessage })
    setSubmitting(true)
    const r = await signIn(email, password, captcha.token)
    captcha.reset()
    if (r.ok) {
      window.location.assign(await destination(requested))
      return
    }
    setSubmitting(false)
    setServerError({ message: r.message, code: r.code })
  }

  async function resend() {
    const r = await resendConfirmation(email, captcha.token)
    captcha.reset()
    setServerError(null)
    setInfo(r.ok ? 'Enviamos um novo link de confirmação para o seu e-mail.' : r.message)
  }

  return (
    <AuthLayout
      title="Entrar"
      subtitle={
        <>
          Ainda não tem conta?{' '}
          <a href="/cadastro" className="font-semibold text-brand-300 hover:text-white">
            Cadastre-se
          </a>
        </>
      }
    >
      <form noValidate onSubmit={onSubmit} className="space-y-5" aria-label="Formulário de login">
        {info && <Alert tone="success">{info}</Alert>}
        {serverError && (
          <Alert tone="error">
            {serverError.message}
            {serverError.code === 'email_not_confirmed' && (
              <button type="button" onClick={resend} className="mt-2 block font-semibold underline">
                Reenviar e-mail de confirmação
              </button>
            )}
          </Alert>
        )}
        <TextField
          label="E-mail"
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <PasswordField
          label="Senha"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <div className="-mt-2 text-right">
          <a href="/recuperar-senha" className="text-sm font-medium text-brand-300 hover:text-white">
            Esqueci minha senha
          </a>
        </div>
        {captcha.widget}
        <Button type="submit" size="lg" className="w-full" disabled={submitting} aria-busy={submitting}>
          {submitting ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </AuthLayout>
  )
}
