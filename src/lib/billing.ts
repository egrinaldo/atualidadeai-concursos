import { FunctionsHttpError } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'
import type { Payment, Subscription } from '@/types/database'

/**
 * Contratação e gestão da assinatura.
 * Todas as operações passam pelas Edge Functions (o Access Token do
 * Mercado Pago nunca chega ao navegador).
 */

type Result<T> = { ok: true; data: T } | { ok: false; message: string }

async function call<T>(fn: string, body: Record<string, unknown> = {}): Promise<Result<T>> {
  try {
    const { data, error } = await getSupabase().functions.invoke<T>(fn, { body })
    if (error) {
      let message = 'Não foi possível concluir a operação. Tente novamente em instantes.'
      if (error instanceof FunctionsHttpError) {
        const payload = await error.context.json().catch(() => null)
        if (payload?.error) message = payload.error
      }
      return { ok: false, message }
    }
    return { ok: true, data: data as T }
  } catch {
    return { ok: false, message: 'Sem conexão com o servidor. Verifique sua internet.' }
  }
}

/** Cria a assinatura no Mercado Pago e devolve o link do checkout. */
export function startCheckout(payerEmail: string, plan = 'mensal') {
  return call<{ checkout_url: string; subscription_id: string; reused?: boolean }>('mp-create-subscription', {
    plan,
    payer_email: payerEmail.trim().toLowerCase(),
  })
}

/** Atualiza o status consultando o Mercado Pago (não confia na URL de retorno). */
export function syncSubscription() {
  return call<{ status: Subscription['status'] | 'none' }>('mp-sync')
}

export function cancelSubscription() {
  return call<{ status: 'cancelled' }>('mp-cancel-subscription')
}

export type BillingSnapshot = { subscription: Subscription | null; lastPayment: Payment | null }

/** Lê do banco (RLS: só os dados do próprio usuário). */
export async function loadBilling(): Promise<BillingSnapshot> {
  const supabase = getSupabase()
  const [s, p] = await Promise.all([
    supabase.from('subscriptions').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  return { subscription: s.data, lastPayment: p.data }
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}
