import { useEffect, useState, type FormEvent } from 'react'
import { Alert } from '@/components/forms/Alert'
import { PasswordField } from '@/components/forms/Field'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui'
import { useSession } from '@/hooks/useSession'
import { readAuthErrorFromUrl, signOut, updatePassword } from '@/lib/auth'
import { validatePassword, validatePasswordConfirmation } from '@/lib/validation'

/**
 * Destino do link de recuperação enviado por e-mail. O Supabase cria uma
 * sessão temporária a partir do link; aqui o usuário define a nova senha.
 */
export function RedefinirSenha() {
  const { session, loading } = useSession()
  const [linkError] = useState(() => readAuthErrorFromUrl())
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirmation?: string }>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Remove os tokens da barra de endereço depois de processados
  useEffect(() => {
    if (session && window.location.hash) history.replaceState(null, '', window.location.pathname)
  }, [session])

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    setServerError(null)
    const e = {
      password: validatePassword(password) ?? undefined,
      confirmation: validatePasswordConfirmation(password, confirmation) ?? undefined,
    }
    setErrors(e)
    if (e.password || e.confirmation) return
    setSubmitting(true)
    const r = await updatePassword(password)
    if (!r.ok) {
      setSubmitting(false)
      setServerError(r.message)
      return
    }
    await signOut()
    window.location.assign('/entrar?senha=redefinida')
  }

  if (loading) {
    return (
      <AuthLayout title="Redefinir senha">
        <p className="text-slate-400" role="status">
          Validando o link…
        </p>
      </AuthLayout>
    )
  }

  if (!session) {
    return (
      <AuthLayout title="Link inválido">
        <div className="space-y-5">
          <Alert tone="error">{linkError ?? 'Este link de redefinição é inválido ou expirou.'}</Alert>
          <Button href="/recuperar-senha" className="w-full">
            Solicitar novo link
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Crie uma nova senha" subtitle={<>Conta: <strong className="text-slate-200">{session.user.email}</strong></>}>
      <form noValidate onSubmit={onSubmit} className="space-y-5" aria-label="Formulário de nova senha">
        {serverError && <Alert tone="error">{serverError}</Alert>}
        <PasswordField
          label="Nova senha"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint="Mínimo de 8 caracteres, com letras e números."
          maxLength={72}
        />
        <PasswordField
          label="Confirmar nova senha"
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          error={errors.confirmation}
          maxLength={72}
        />
        <Button type="submit" size="lg" className="w-full" disabled={submitting} aria-busy={submitting}>
          {submitting ? 'Salvando…' : 'Salvar nova senha'}
        </Button>
      </form>
    </AuthLayout>
  )
}
