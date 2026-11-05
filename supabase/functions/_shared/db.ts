import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.119.0'
import { requireEnv } from './http.ts'

/**
 * Cliente administrativo (ignora RLS). Usa a chave secreta injetada
 * automaticamente pelo Supabase nas Edge Functions — nunca exposta.
 */
export function adminClient(): SupabaseClient {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? requireEnv('SUPABASE_SECRET_KEY')
  return createClient(requireEnv('SUPABASE_URL'), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Identifica o usuário logado a partir do token enviado pelo site. */
export async function userFromRequest(req: Request, admin: SupabaseClient): Promise<User | null> {
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}

/**
 * Nível de autenticação da sessão (aal1 = senha; aal2 = senha + código MFA).
 * Lido do JWT já validado por userFromRequest.
 */
export function sessionAal(req: Request): 'aal1' | 'aal2' | null {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')))
    return payload.aal === 'aal2' ? 'aal2' : payload.aal === 'aal1' ? 'aal1' : null
  } catch {
    return null
  }
}

/**
 * Limite de requisições (janela fixa, contador no Postgres).
 * Em caso de falha do banco, não bloqueia (fail-open) para não impedir pagamentos.
 */
export async function rateLimited(admin: SupabaseClient, key: string, max: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await admin.rpc('rate_limit_hit', { p_key: key, p_max: max, p_window_seconds: windowSeconds })
  if (error) {
    console.error('[rate-limit]', error.message)
    return false
  }
  return data === false
}

export async function logEvent(
  admin: SupabaseClient,
  event: {
    source: 'webhook' | 'sync' | 'checkout'
    topic?: string | null
    signature_ts?: string | null
    action?: string | null
    resource_id?: string | null
    request_id?: string | null
    signature_valid?: boolean | null
    status: 'received' | 'processed' | 'ignored' | 'failed' | 'rejected'
    error?: string | null
    payload?: unknown
  },
): Promise<string | null> {
  const { data } = await admin
    .from('payment_events')
    .insert({ ...event, processed_at: event.status === 'received' ? null : new Date().toISOString() })
    .select('id')
    .single()
  return (data?.id as string) ?? null
}

export async function updateEvent(admin: SupabaseClient, id: string | null, status: string, error?: string | null) {
  if (!id) return
  await admin.from('payment_events').update({ status, error: error ?? null, processed_at: new Date().toISOString() }).eq('id', id)
}
