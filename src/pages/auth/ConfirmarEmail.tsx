import { useEffect, useState } from 'react'
import { Alert } from '@/components/forms/Alert'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button, Icon } from '@/components/ui'
import { useSession } from '@/hooks/useSession'
import { readAuthErrorFromUrl, verifyEmailLink } from '@/lib/auth'

/** Destino do link de confirmação de cadastro enviado por e-mail. */
export function ConfirmarEmail() {
  const { session, loading } = useSession()
  const [linkError, setLinkError] = useState(() => readAuthErrorFromUrl())
  // Link novo (?token_hash=...): validado aqui, sem tokens de sessão na URL
  const [verifying, setVerifying] = useState(() => new URLSearchParams(window.location.search).has('token_hash'))

  useEffect(() => {
    if (!verifying) return
    verifyEmailLink('email').then((r) => {
      if (r && !r.ok) setLinkError(r.message)
      setVerifying(false)
    })
  }, [verifying])

  useEffect(() => {
    if (session && (window.location.hash || window.location.search)) history.replaceState(null, '', window.location.pathname)
  }, [session])

  if (loading || verifying) {
    return (
      <AuthLayout title="Confirmando e-mail">
        <p className="text-slate-400" role="status">
          Validando o link…
        </p>
      </AuthLayout>
    )
  }

  if (session) {
    return (
      <AuthLayout title="E-mail confirmado!">
        <div className="space-y-6 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-success-400/15 text-success-400 ring-1 ring-success-400/30">
            <Icon name="check" className="size-8" />
          </div>
          <p className="text-slate-300">Sua conta está ativa. O próximo passo é contratar a assinatura.</p>
          <Button href="/conta" size="lg" className="w-full">
            Ir para minha conta
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Não foi possível confirmar">
      <div className="space-y-5">
        <Alert tone="error">
          {linkError ?? 'O link de confirmação é inválido ou expirou.'} Se você já confirmou o e-mail, basta entrar.
        </Alert>
        <Button href="/entrar" className="w-full">
          Entrar
        </Button>
        <p className="text-center text-sm text-slate-400">
          Ao tentar entrar com uma conta não confirmada, você poderá reenviar o e-mail de confirmação.
        </p>
      </div>
    </AuthLayout>
  )
}
