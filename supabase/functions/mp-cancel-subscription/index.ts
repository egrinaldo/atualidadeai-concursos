/**
 * POST /functions/v1/mp-cancel-subscription   (requer usuário logado)
 *
 * Cancela no Mercado Pago a assinatura ativa/pendente/pausada do usuário
 * (interrompe as próximas cobranças) e atualiza o banco com o estado
 * retornado pela API.
 */
import { adminClient, logEvent, userFromRequest } from '../_shared/db.ts'
import { errorMessage, json, preflight } from '../_shared/http.ts'
import { MercadoPago } from '../_shared/mercadopago.ts'
import { applyPreapproval } from '../_shared/sync.ts'

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const admin = adminClient()
  const user = await userFromRequest(req, admin)
  if (!user) return json({ error: 'Faça login.' }, 401)

  const { data: sub } = await admin
    .from('subscriptions')
    .select('id, external_subscription_id')
    .eq('user_id', user.id)
    .in('status', ['active', 'pending', 'paused'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!sub) return json({ error: 'Nenhuma assinatura para cancelar.' }, 404)

  try {
    if (sub.external_subscription_id) {
      const updated = await MercadoPago.updatePreapproval(sub.external_subscription_id, { status: 'cancelled' })
      await applyPreapproval(admin, updated)
    } else {
      await admin.from('subscriptions').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', sub.id)
    }
    await logEvent(admin, { source: 'sync', topic: 'preapproval', action: 'cancel', resource_id: sub.external_subscription_id, status: 'processed' })
    return json({ status: 'cancelled' })
  } catch (e) {
    const msg = errorMessage(e)
    console.error('[mp-cancel-subscription]', msg)
    await logEvent(admin, { source: 'sync', topic: 'preapproval', action: 'cancel', resource_id: sub.external_subscription_id, status: 'failed', error: msg })
    return json({ error: 'Não foi possível cancelar agora. Tente novamente em instantes.' }, 502)
  }
})
