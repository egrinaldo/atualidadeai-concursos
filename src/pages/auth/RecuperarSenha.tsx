import { useState, type FormEvent } from 'react'
import { Alert } from '@/components/forms/Alert'
import { TextField } from '@/components/forms/Field'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui'
import { requestPasswordReset } from '@/lib/auth'
import { validateEmail } from '@/lib/validation'

export function RecuperarSenha() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string>()
  const [serverError, setServerError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    setServerError(null)
    const e = validateEmail(email)
    setError(e ?? undefined)
    if (e) return
    setSubmitting(true)
    const r = await requestPasswordReset(email)
    setSubmitting(false)
    if (r.ok) setSent(true)
    else setServerError(r.message)
  }

  return (
    <AuthLayout
      title="Recuperar senha"
      subtitle="Informe o e-mail da sua conta. Enviaremos um link para criar uma nova senha."
    >
      {sent ? (
        <div className="space-y-5">
          {/* Mensagem genérica: não revela se o e-mail está cadastrado */}
          <Alert tone="success" title="Verifique seu e-mail">
            Se houver uma conta com <strong className="break-all">{email.trim().toLowerCase()}</strong>, você receberá um link
            para redefinir a senha em instantes. Confira também a caixa de spam.
          </Alert>
          <Button href="/entrar" variant="secondary" className="w-full">
            Voltar para o login
          </Button>
        </div>
      ) : (
        <form noValidate onSubmit={onSubmit} className="space-y-5" aria-label="Formulário de recuperação de senha">
          {serverError && <Alert tone="error">{serverError}</Alert>}
          <TextField
            label="E-mail"
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error}
          />
          <Button type="submit" size="lg" className="w-full" disabled={submitting} aria-busy={submitting}>
            {submitting ? 'Enviando…' : 'Enviar link'}
          </Button>
          <p className="text-center text-sm text-slate-400">
            Lembrou a senha?{' '}
            <a href="/entrar" className="font-semibold text-brand-300 hover:text-white">
              Entrar
            </a>
          </p>
        </form>
      )}
    </AuthLayout>
  )
}
