/**
 * POST /functions/v1/account   (requer usuário logado)
 *
 * Direitos do titular (LGPD):
 *   { action: "export" }                    → todos os dados pessoais do usuário (JSON)
 *   { action: "delete", password: "..." }   → exclui a conta
 *
 * Exclusão:
 * - exige a senha atual (evita exclusão com sessão roubada ou esquecida aberta);
 * - cancela no Mercado Pago assinaturas ativas/pendentes (sem novas cobranças);
 * - apaga perfil, preferências, assinaturas, e-mails registrados e lead;
 * - mantém os PAGAMENTOS sem vínculo com a pessoa (user_id = null), pois são
 *   registros financeiros com obrigação legal de guarda;
 * - administradores não podem se excluir por aqui (evita perder o acesso).
 */
import { adminClient, logEvent, rateLimited, userFromRequest } from '../_shared/db.ts'
import { errorMessage, json, preflight, requireEnv, tooManyRequests } from '../_shared/http.ts'
import { MercadoPago } from '../_shared/mercadopago.ts'

async function passwordMatches(email: string, password: string): Promise<boolean> {
  const res = await fetch(`${requireEnv('SUPABASE_URL')}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: requireEnv('SUPABASE_ANON_KEY'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(10000),
  })
  return res.ok
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const db = adminClient()
  const user = await userFromRequest(req, db)
  if (!user) return json({ error: 'Faça login.' }, 401)
  if (await rateLimited(db, `account:${user.id}`, 10, 600)) return tooManyRequests()

  const body = (await req.json().catch(() => ({}))) as { action?: string; password?: string }

  try {
    if (body.action === 'export') {
      const [profile, prefs, subs, pays, emails] = await Promise.all([
        db.from('profiles').select('full_name, email, state, city, terms_accepted_at, created_at, updated_at').eq('id', user.id).maybeSingle(),
        db.from('user_preferences').select('state, city, interests, created_at, updated_at').eq('user_id', user.id).maybeSingle(),
        db.from('subscriptions').select('status, started_at, next_payment_at, cancelled_at, created_at').eq('user_id', user.id).order('created_at'),
        db.from('payments').select('amount, currency, status, paid_at, created_at').eq('user_id', user.id).order('created_at'),
        db.from('email_log').select('kind, subject, status, created_at').eq('user_id', user.id).order('created_at'),
      ])
      const { data: lead } = await db.from('leads').select('name, email, state, city, source, created_at').eq('email', (user.email ?? '').toLowerCase()).maybeSingle()
      return json({
        exported_at: new Date().toISOString(),
        account: { id: user.id, email: user.email, created_at: user.created_at, last_sign_in_at: user.last_sign_in_at },
        profile: profile.data,
        preferences: prefs.data,
        subscriptions: subs.data ?? [],
        payments: pays.data ?? [],
        emails_sent: emails.data ?? [],
        lead,
      })
    }

    if (body.action === 'delete') {
      if (typeof body.password !== 'string' || !body.password || !user.email) return json({ error: 'Informe sua senha para confirmar.' }, 400)
      const { data: isAdmin } = await db.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
      if (isAdmin) return json({ error: 'Contas de administrador não podem ser excluídas por aqui.' }, 409)
      if (!(await passwordMatches(user.email, body.password))) return json({ error: 'Senha incorreta.' }, 403)

      const { data: subs } = await db
        .from('subscriptions')
        .select('id, external_subscription_id')
        .eq('user_id', user.id)
        .in('status', ['active', 'pending', 'paused'])
      for (const s of subs ?? []) {
        if (s.external_subscription_id) await MercadoPago.updatePreapproval(s.external_subscription_id, { status: 'cancelled' })
      }

      await db.from('email_log').delete().eq('user_id', user.id)
      await db.from('leads').delete().eq('email', user.email.toLowerCase())
      // payments.user_id e subscription_id viram null (FK "on delete set null"); o restante cai em cascata
      const { error } = await db.auth.admin.deleteUser(user.id)
      if (error) throw new Error(`falha ao excluir usuário: ${error.message}`)
      await logEvent(db, { source: 'sync', topic: 'account', action: 'delete', status: 'processed' })
      return json({ deleted: true })
    }

    return json({ error: 'Ação desconhecida.' }, 400)
  } catch (e) {
    console.error('[account]', body.action, errorMessage(e))
    return json({ error: 'Não foi possível concluir agora. Tente novamente em instantes.' }, 502)
  }
})
