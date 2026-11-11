import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { clearActivity, isIdleExpired, touchActivity, watchIdle } from '@/lib/idle'

/** Encerra a sessão neste navegador por inatividade e leva para /entrar com o aviso. */
async function expireSession() {
  clearActivity()
  await supabase?.auth.signOut({ scope: 'local' }).catch(() => null)
  window.location.assign('/entrar?motivo=inatividade')
}

/**
 * Sessão atual do Supabase Auth, atualizada em tempo real
 * (login, logout, renovação de token, link de recuperação de senha).
 * Encerra a sessão após o tempo de inatividade (src/lib/idle.ts).
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [event, setEvent] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      if (data.session && isIdleExpired()) {
        void expireSession()
        return
      }
      if (data.session) touchActivity()
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((evt, s) => {
      if (!active) return
      if (evt === 'SIGNED_OUT') clearActivity()
      setEvent(evt)
      setSession(s)
      setLoading(false)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  // Vigia a inatividade enquanto houver sessão
  const signedIn = !!session
  useEffect(() => {
    if (!signedIn) return
    return watchIdle(() => void expireSession())
  }, [signedIn])

  return { session, loading, event }
}
