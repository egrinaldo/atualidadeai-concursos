/**
 * POST /functions/v1/mp-sync   (requer usuário logado)
 *
 * Consulta no Mercado Pago a assinatura mais recente do usuário e
 * atualiza o banco. Usado na página de retorno do checkout e na área do
 * assinante — garante o status correto mesmo se um webhook atrasar.
 * A decisão é sempre baseada na API do Mercado Pago, nunca na URL de retorno.
 */
import { adminClient, logEvent, rateLimited, userFromRequest } from '../_shared/db.ts'
import { errorMessage, json, preflight, tooManyRequests } from '../_shared/http.ts'
import { MercadoPago } from '../_shared/mercadopago.ts'
import { applyPreapproval, fullSync } from '../_shared/sync.ts'

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const admin = adminClient()
  const user = await userFromRequest(req, admin)
  if (!user) return json({ error: 'Faça login.' }, 401)
  // Cada sincronização consulta a API do Mercado Pago: até 20 a cada 10 minutos
  if (await rateLimited(admin, `mp-sync:${user.id}`, 20, 600)) return tooManyRequests()

  const { data: sub } = await admin
    .from('subscriptions')
    .select('id, status, external_subscription_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!sub) return json({ status: 'none' })

  try {
    if (sub.external_subscription_id) {
      await fullSync(admin, sub.external_subscription_id)
    } else {
      const found = await MercadoPago.searchPreapprovalsByReference(sub.id)
      const preapproval = found.results?.[0]
      if (preapproval) {
        await applyPreapproval(admin, preapproval)
        await fullSync(admin, preapproval.id)
      }
    }
    await logEvent(admin, { source: 'sync', topic: 'preapproval', resource_id: sub.external_subscription_id, status: 'processed' })
  } catch (e) {
    const msg = errorMessage(e)
    console.error('[mp-sync]', msg)
    await logEvent(admin, { source: 'sync', topic: 'preapproval', resource_id: sub.external_subscription_id, status: 'failed', error: msg })
    // Devolve o último status conhecido mesmo se o Mercado Pago estiver indisponível
  }

  const { data: fresh } = await admin
    .from('subscriptions')
    .select('id, status, next_payment_at, started_at, cancelled_at')
    .eq('id', sub.id)
    .single()
  return json({ status: fresh?.status ?? sub.status, subscription: fresh })
})
