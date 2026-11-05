import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0'
import { emailForPaymentStatus, notifyUser } from './email/notify.ts'
import { amountMatches, isUuid, mapPaymentStatus, mapPreapprovalStatus, revokesAccess } from './mapping.ts'
import { MercadoPago, type AuthorizedPayment, type Payment, type Preapproval } from './mercadopago.ts'

/**
 * Aplica no banco o estado CONSULTADO na API do Mercado Pago.
 *
 * Princípios:
 * - nunca confiar no conteúdo da notificação nem no redirecionamento do
 *   checkout: sempre buscar o recurso na API com o Access Token;
 * - operações idempotentes: reprocessar a mesma notificação produz o mesmo
 *   resultado (pagamentos com external_payment_id único, upsert);
 * - valor e moeda conferidos com o plano antes de ativar;
 * - e-mails disparados nas mudanças de estado (idempotentes via email_log).
 */

export type ApplyResult = { status: 'processed' | 'ignored'; detail: string; subscriptionId?: string }

type LocalSub = {
  id: string
  user_id: string
  status: string
  started_at: string | null
  cancelled_at: string | null
  plans: { price: number; currency: string } | null
}

async function findSubscription(admin: SupabaseClient, pre: Pick<Preapproval, 'id' | 'external_reference'>): Promise<LocalSub | null> {
  const cols = 'id, user_id, status, started_at, cancelled_at, plans(price, currency)'
  if (isUuid(pre.external_reference)) {
    const { data } = await admin.from('subscriptions').select(cols).eq('id', pre.external_reference).maybeSingle()
    if (data) return data as unknown as LocalSub
  }
  const { data } = await admin.from('subscriptions').select(cols).eq('external_subscription_id', pre.id).maybeSingle()
  return (data as unknown as LocalSub) ?? null
}

export async function applyPreapproval(admin: SupabaseClient, pre: Preapproval): Promise<ApplyResult> {
  const sub = await findSubscription(admin, pre)
  if (!sub) return { status: 'ignored', detail: `assinatura local não encontrada para preapproval ${pre.id}` }

  let status = mapPreapprovalStatus(pre.status)
  let detail = `preapproval ${pre.id}: ${pre.status} → ${status}`

  if (status === 'active' && sub.plans && !amountMatches(pre.auto_recurring, sub.plans)) {
    status = 'pending'
    detail = `valor/moeda divergente do plano — assinatura NÃO ativada (${pre.auto_recurring?.transaction_amount} ${pre.auto_recurring?.currency_id})`
  }

  const now = new Date().toISOString()
  const update: Record<string, unknown> = {
    external_subscription_id: pre.id,
    provider_status: pre.status,
    status,
    next_payment_at: pre.next_payment_date ?? null,
    checkout_url: pre.init_point ?? pre.sandbox_init_point ?? null,
  }
  if (status === 'active') {
    update.started_at = sub.started_at ?? now
    update.expires_at = pre.next_payment_date ?? null
    update.cancelled_at = null
  }
  if (status === 'cancelled' && !sub.cancelled_at) update.cancelled_at = now

  const { error } = await admin.from('subscriptions').update(update).eq('id', sub.id)
  if (error) throw new Error(`falha ao atualizar assinatura: ${error.message}`)

  // Ativação (primeira vez desta assinatura): confirmação de contratação + orientações iniciais
  if (status === 'active' && sub.status !== 'active') {
    const data = { amount: pre.auto_recurring?.transaction_amount ?? null, nextPaymentDate: pre.next_payment_date ?? null }
    await notifyUser(admin, { userId: sub.user_id, kind: 'assinatura_ativada', dedupeKey: `subscription:${sub.id}:activated`, data })
    await notifyUser(admin, { userId: sub.user_id, kind: 'orientacoes_iniciais', dedupeKey: `user:${sub.user_id}:welcome` })
  }
  return { status: 'processed', detail, subscriptionId: sub.id }
}

async function upsertPayment(
  admin: SupabaseClient,
  sub: { id: string; user_id: string } | null,
  p: { id: string; status: string; status_detail?: string | null; amount?: number; currency?: string; paid_at?: string | null },
) {
  const status = mapPaymentStatus(p.status)
  const { error } = await admin.from('payments').upsert(
    {
      external_payment_id: p.id,
      user_id: sub?.user_id ?? null,
      subscription_id: sub?.id ?? null,
      amount: p.amount ?? 0,
      currency: (p.currency ?? 'BRL').toUpperCase(),
      status,
      status_detail: p.status_detail ?? null,
      paid_at: status === 'approved' ? (p.paid_at ?? new Date().toISOString()) : null,
    },
    { onConflict: 'external_payment_id' },
  )
  if (error) throw new Error(`falha ao registrar pagamento: ${error.message}`)

  // Estorno/contestação: cancela a assinatura no Mercado Pago (sem novas cobranças)
  if (sub && revokesAccess(status)) await cancelAfterRefund(admin, sub.id, p.id, status)

  // Um e-mail por pagamento e status (aprovado, pendente ou recusado)
  const kind = emailForPaymentStatus(status)
  if (kind && sub) {
    await notifyUser(admin, {
      userId: sub.user_id,
      kind,
      dedupeKey: `payment:${p.id}:${kind}`,
      data: { amount: p.amount ?? null },
    })
  }
}

async function cancelAfterRefund(admin: SupabaseClient, subscriptionId: string, paymentId: string, status: string) {
  const { data: s } = await admin
    .from('subscriptions')
    .select('id, status, external_subscription_id')
    .eq('id', subscriptionId)
    .maybeSingle()
  if (!s || !['active', 'pending', 'paused'].includes(s.status as string)) return
  if (s.external_subscription_id) {
    const updated = await MercadoPago.updatePreapproval(s.external_subscription_id as string, { status: 'cancelled' })
    await applyPreapproval(admin, updated)
  } else {
    await admin.from('subscriptions').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', s.id)
  }
  await admin.from('payment_events').insert({
    source: 'sync',
    topic: 'payment',
    action: 'cancel_after_refund',
    resource_id: paymentId,
    status: 'processed',
    error: `assinatura ${s.id} cancelada: pagamento ${status}`,
    processed_at: new Date().toISOString(),
  })
}

export async function applyAuthorizedPayment(admin: SupabaseClient, ap: AuthorizedPayment): Promise<ApplyResult> {
  const paymentId = ap.payment?.id != null ? String(ap.payment.id) : null
  if (!paymentId) return { status: 'ignored', detail: `cobrança ${ap.id} ainda sem pagamento (status ${ap.status})` }

  const sub = await findSubscription(admin, { id: ap.preapproval_id, external_reference: null })
  await upsertPayment(admin, sub, {
    id: paymentId,
    status: ap.payment?.status ?? 'pending',
    status_detail: ap.payment?.status_detail,
    amount: ap.transaction_amount,
    currency: ap.currency_id,
    paid_at: ap.last_modified ?? ap.date_created,
  })
  return { status: 'processed', detail: `pagamento ${paymentId}: ${ap.payment?.status}`, subscriptionId: sub?.id }
}

export async function applyPayment(admin: SupabaseClient, p: Payment): Promise<ApplyResult> {
  const preapprovalId = typeof p.metadata?.preapproval_id === 'string' ? p.metadata.preapproval_id : null
  let sub: LocalSub | null = null
  if (preapprovalId) sub = await findSubscription(admin, { id: preapprovalId, external_reference: null })
  if (!sub && isUuid(p.external_reference)) sub = await findSubscription(admin, { id: '', external_reference: p.external_reference })
  if (!sub) return { status: 'ignored', detail: `pagamento ${p.id} não vinculado a uma assinatura` }

  await upsertPayment(admin, sub, {
    id: String(p.id),
    status: p.status,
    status_detail: p.status_detail,
    amount: p.transaction_amount,
    currency: p.currency_id,
    paid_at: p.date_approved,
  })
  return { status: 'processed', detail: `pagamento ${p.id}: ${p.status}`, subscriptionId: sub.id }
}

/** Consulta a assinatura e todas as cobranças no Mercado Pago e atualiza o banco. */
export async function fullSync(admin: SupabaseClient, preapprovalId: string): Promise<ApplyResult> {
  const pre = await MercadoPago.getPreapproval(preapprovalId)
  const result = await applyPreapproval(admin, pre)
  try {
    const list = await MercadoPago.searchAuthorizedPayments(preapprovalId)
    for (const ap of list.results ?? []) await applyAuthorizedPayment(admin, ap)
  } catch {
    /* sem cobranças ainda: ignorar */
  }
  return result
}
