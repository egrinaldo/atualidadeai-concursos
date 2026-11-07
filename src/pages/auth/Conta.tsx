import { useEffect, useRef, useState } from 'react'
import { Alert } from '@/components/forms/Alert'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { DocumentsPanel } from '@/components/account/DocumentsPanel'
import { PrivacyPanel } from '@/components/account/PrivacyPanel'
import { SubscriptionPanel } from '@/components/billing/SubscriptionPanel'
import { Button, Icon } from '@/components/ui'
import { ufName } from '@/data/ufs'
import { useSession } from '@/hooks/useSession'
import { isAdmin } from '@/lib/admin'
import { signOut } from '@/lib/auth'
import { getSupabase } from '@/lib/supabase'
import type { Profile } from '@/types/database'

/**
 * Área do assinante: assinatura, informativos entregues (Subetapa 2.8) e dados da conta.
 */
export function Conta() {
  const { session, loading } = useSession()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fetched, setFetched] = useState(false)
  // null = verificando; administradores são levados ao painel
  const [admin, setAdmin] = useState<boolean | null>(null)
  // Evita que o fim da sessão (logout) dispare o redirecionamento para o login
  const leaving = useRef(false)

  useEffect(() => {
    if (loading) return
    if (!session) {
      if (!leaving.current) window.location.replace('/entrar?next=/conta')
      return
    }
    // Administrador não é assinante: a área dele é o painel.
    isAdmin(session.user.id).then((yes) => {
      if (yes) window.location.replace('/admin')
      setAdmin(yes)
    })
    const supabase = getSupabase()
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()
      .then((p) => {
        if (p.error) setError('Não foi possível carregar seus dados. Atualize a página.')
        setProfile(p.data)
        setFetched(true)
      })
  }, [session, loading])

  async function logout() {
    leaving.current = true
    await signOut()
    window.location.assign('/')
  }

  if (loading || !session || !fetched || admin !== false) {
    return (
      <AuthLayout title="Minha conta">
        <p className="text-slate-400" role="status">
          Carregando…
        </p>
      </AuthLayout>
    )
  }

  const firstName = profile?.full_name.split(' ')[0] ?? ''

  return (
    <AuthLayout title={firstName ? `Olá, ${firstName}!` : 'Minha conta'} subtitle="Área do assinante" wide={false}>
      <div className="space-y-6">
        {error && <Alert tone="error">{error}</Alert>}


        <SubscriptionPanel accountEmail={session.user.email ?? ''} />

        <DocumentsPanel />

        <section aria-labelledby="dados-title">
          <h2 id="dados-title" className="text-base font-semibold">
            Seus dados
          </h2>
          <dl className="mt-3 divide-y divide-white/8 rounded-2xl border border-white/10 text-sm">
            {[
              ['Nome', profile?.full_name || '—'],
              ['E-mail', session.user.email ?? '—'],
              ['Estado', profile?.state ? ufName(profile.state) : '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-slate-400">{k}</dt>
                <dd className="text-right break-all text-slate-100">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <PrivacyPanel
          onLeaving={() => {
            leaving.current = true
          }}
        />

        <Button variant="ghost" className="w-full" onClick={logout}>
          <Icon name="arrowRight" className="size-4 rotate-180" />
          Sair da conta
        </Button>
      </div>
    </AuthLayout>
  )
}
