import { requireEnv } from './http.ts'

/**
 * Cliente mínimo da API do Mercado Pago (somente servidor).
 * O Access Token vem do secret MERCADO_PAGO_ACCESS_TOKEN.
 */

const BASE = 'https://api.mercadopago.com'

export class MercadoPagoError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message)
  }
}

async function mp<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${requireEnv('MERCADO_PAGO_ACCESS_TOKEN')}`,
    'Content-Type': 'application/json',
  }
  if (init.idempotencyKey) headers['X-Idempotency-Key'] = init.idempotencyKey
  const res = await fetch(BASE + path, { ...init, headers, signal: AbortSignal.timeout(15000) })
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  if (!res.ok) {
    const msg = (body && (body.message || body.error)) || res.statusText
    throw new MercadoPagoError(res.status, body, `Mercado Pago ${res.status}: ${msg}`)
  }
  return body as T
}

export type Preapproval = {
  id: string
  status: string
  external_reference?: string | null
  payer_email?: string | null
  init_point?: string | null
  sandbox_init_point?: string | null
  reason?: string | null
  date_created?: string | null
  next_payment_date?: string | null
  auto_recurring?: { transaction_amount?: number; currency_id?: string; frequency?: number; frequency_type?: string } | null
}

export type AuthorizedPayment = {
  id: number | string
  preapproval_id: string
  status: string
  transaction_amount?: number
  currency_id?: string
  date_created?: string
  last_modified?: string
  debit_date?: string
  payment?: { id?: number | string | null; status?: string | null; status_detail?: string | null } | null
}

export type Payment = {
  id: number | string
  status: string
  status_detail?: string | null
  transaction_amount?: number
  currency_id?: string
  date_approved?: string | null
  date_created?: string | null
  external_reference?: string | null
  metadata?: Record<string, unknown> | null
}

export const MercadoPago = {
  createPreapproval: (body: Record<string, unknown>, idempotencyKey: string) =>
    mp<Preapproval>('/preapproval', { method: 'POST', body: JSON.stringify(body), idempotencyKey }),
  getPreapproval: (id: string) => mp<Preapproval>(`/preapproval/${encodeURIComponent(id)}`),
  updatePreapproval: (id: string, body: Record<string, unknown>) =>
    mp<Preapproval>(`/preapproval/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) }),
  searchPreapprovalsByReference: (externalReference: string) =>
    mp<{ results: Preapproval[] }>(`/preapproval/search?external_reference=${encodeURIComponent(externalReference)}`),
  getAuthorizedPayment: (id: string) => mp<AuthorizedPayment>(`/authorized_payments/${encodeURIComponent(id)}`),
  searchAuthorizedPayments: (preapprovalId: string) =>
    mp<{ results: AuthorizedPayment[] }>(`/authorized_payments/search?preapproval_id=${encodeURIComponent(preapprovalId)}`),
  getPayment: (id: string) => mp<Payment>(`/v1/payments/${encodeURIComponent(id)}`),
}
