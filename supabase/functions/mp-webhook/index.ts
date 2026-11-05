/**
 * POST /functions/v1/mp-webhook   (chamado pelo Mercado Pago; sem login)
 *
 * 1. Valida a assinatura x-signature com MERCADO_PAGO_WEBHOOK_SECRET.
 * 2. Registra o evento em payment_events (auditoria).
 * 3. Busca o recurso na API do Mercado Pago (nunca confia no corpo).
 * 4. Atualiza assinatura/pagamento de forma idempotente.
 *
 * Respostas: 200 = recebido (o Mercado Pago não reenvia);
 *            401 = assinatura inválida; 500 = erro temporário (reenvia).
 */
import { adminClient, logEvent, updateEvent } from '../_shared/db.ts'
import { errorMessage, json } from '../_shared/http.ts'
import { notificationKind } from '../_shared/mapping.ts'
import { MercadoPago, MercadoPagoError } from '../_shared/mercadopago.ts'
import { verifyMercadoPagoSignature } from '../_shared/signature.ts'
import { applyAuthorizedPayment, applyPayment, applyPreapproval, fullSync, type ApplyResult } from '../_shared/sync.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const url = new URL(req.url)
  const body = await req.json().catch(() => ({}) as Record<string, unknown>)
  const type = url.searchParams.get('type') ?? url.searchParams.get('topic') ?? (body?.type as string) ?? null
  const dataId = url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? (body?.data as { id?: string })?.id ?? null
  const action = (body?.action as string) ?? null
  const requestId = req.headers.get('x-request-id')

  const admin = adminClient()
  const check = await verifyMercadoPagoSignature({
    xSignature: req.headers.get('x-signature'),
    xRequestId: requestId,
    dataId: url.searchParams.get('data.id') ?? (dataId ? String(dataId) : null),
    secret: Deno.env.get('MERCADO_PAGO_WEBHOOK_SECRET') ?? '',
  })

  const eventId = await logEvent(admin, {
    source: 'webhook',
    topic: type,
    action,
    resource_id: dataId ? String(dataId) : null,
    request_id: requestId,
    signature_valid: check.valid,
    status: check.valid ? 'received' : 'rejected',
    error: check.valid ? null : check.reason,
    payload: body,
  })

  if (!check.valid) {
    console.warn('[mp-webhook] assinatura inválida:', check.reason)
    return json({ error: 'invalid signature' }, check.reason === 'secret_not_configured' ? 500 : 401)
  }
  if (!dataId) {
    await updateEvent(admin, eventId, 'ignored', 'notificação sem data.id')
    return json({ ok: true })
  }

  try {
    let result: ApplyResult
    switch (notificationKind(type)) {
      case 'preapproval':
        result = await applyPreapproval(admin, await MercadoPago.getPreapproval(String(dataId)))
        break
      case 'authorized_payment': {
        const ap = await MercadoPago.getAuthorizedPayment(String(dataId))
        result = await applyAuthorizedPayment(admin, ap)
        await fullSync(admin, ap.preapproval_id) // reflete o efeito do pagamento na assinatura
        break
      }
      case 'payment':
        result = await applyPayment(admin, await MercadoPago.getPayment(String(dataId)))
        break
      default:
        result = { status: 'ignored', detail: `tipo não tratado: ${type}` }
    }
    await updateEvent(admin, eventId, result.status, result.detail)
    return json({ ok: true })
  } catch (e) {
    // Recurso inexistente (ex.: notificação simulada com ID fictício): não reenviar
    if (e instanceof MercadoPagoError && e.status === 404) {
      await updateEvent(admin, eventId, 'ignored', 'recurso não encontrado no Mercado Pago')
      return json({ ok: true })
    }
    const msg = errorMessage(e)
    console.error('[mp-webhook]', msg)
    await updateEvent(admin, eventId, 'failed', msg)
    return json({ error: 'temporary failure' }, 500)
  }
})
