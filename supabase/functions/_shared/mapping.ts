/**
 * Regras de conversão entre os dados do Mercado Pago e o banco.
 * Módulo sem dependências (testável no Node).
 */

export type LocalSubscriptionStatus = 'pending' | 'active' | 'paused' | 'cancelled' | 'expired'
export type LocalPaymentStatus =
  | 'pending'
  | 'approved'
  | 'authorized'
  | 'in_process'
  | 'in_mediation'
  | 'rejected'
  | 'cancelled'
  | 'refunded'
  | 'charged_back'

/** Status da assinatura (preapproval) no Mercado Pago → status local. */
export function mapPreapprovalStatus(mpStatus: string | null | undefined): LocalSubscriptionStatus {
  switch ((mpStatus ?? '').toLowerCase()) {
    case 'authorized':
      return 'active'
    case 'paused':
      return 'paused'
    case 'cancelled':
      return 'cancelled'
    case 'finished':
    case 'expired':
      return 'expired'
    default:
      return 'pending'
  }
}

const PAYMENT_STATUSES: LocalPaymentStatus[] = [
  'pending', 'approved', 'authorized', 'in_process', 'in_mediation', 'rejected', 'cancelled', 'refunded', 'charged_back',
]

/** Status de pagamento do Mercado Pago → status local (desconhecido vira "pending"). */
export function mapPaymentStatus(mpStatus: string | null | undefined): LocalPaymentStatus {
  const s = (mpStatus ?? '').toLowerCase() as LocalPaymentStatus
  return PAYMENT_STATUSES.includes(s) ? s : 'pending'
}

export type NotificationKind = 'preapproval' | 'authorized_payment' | 'payment' | 'other'

/** Identifica o tipo da notificação (formato novo "type" e legado "topic"). */
export function notificationKind(type: string | null | undefined): NotificationKind {
  switch ((type ?? '').toLowerCase()) {
    case 'subscription_preapproval':
    case 'preapproval':
      return 'preapproval'
    case 'subscription_authorized_payment':
    case 'authorized_payment':
      return 'authorized_payment'
    case 'payment':
      return 'payment'
    default:
      return 'other'
  }
}

/**
 * Estorno ou contestação (chargeback) encerra a assinatura: o acesso pago
 * não pode continuar sobre um pagamento devolvido.
 */
export function revokesAccess(paymentStatus: LocalPaymentStatus): boolean {
  return paymentStatus === 'refunded' || paymentStatus === 'charged_back'
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

/**
 * Garante que a assinatura no Mercado Pago tem o valor e a moeda do plano.
 * Uma assinatura com valor divergente nunca é ativada.
 */
export function amountMatches(
  mp: { transaction_amount?: number | null; currency_id?: string | null } | null | undefined,
  plan: { price: number | string; currency: string },
): boolean {
  if (!mp || mp.transaction_amount == null) return false
  const sameAmount = Math.round(Number(mp.transaction_amount) * 100) === Math.round(Number(plan.price) * 100)
  const sameCurrency = (mp.currency_id ?? '').toUpperCase() === plan.currency.toUpperCase()
  return sameAmount && sameCurrency
}

/** Plano com preço de entrada (promoção do 1º mês). */
export type PlanPricing = { price: number | string; intro_price?: number | string | null; intro_until?: string | null }

/** A promoção do 1º mês vale agora? (intro_until é exclusivo) */
export function introActive(plan: PlanPricing, now = new Date()): boolean {
  if (plan.intro_price == null || !plan.intro_until) return false
  const fim = new Date(plan.intro_until)
  return !Number.isNaN(fim.getTime()) && now < fim && Number(plan.intro_price) < Number(plan.price)
}

/** Valor da 1ª cobrança para quem assina agora: preço de entrada na promoção, senão o preço normal. */
export function firstChargeAmount(plan: PlanPricing, now = new Date()): number {
  return Number(introActive(plan, now) ? plan.intro_price : plan.price)
}

/** Frequência de cobrança do plano local → parâmetros do Mercado Pago. */
export function billingToMp(period: string): { frequency: number; frequency_type: 'months' } {
  if (period === 'quarterly') return { frequency: 3, frequency_type: 'months' }
  if (period === 'yearly') return { frequency: 12, frequency_type: 'months' }
  return { frequency: 1, frequency_type: 'months' }
}
