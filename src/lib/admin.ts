import { call } from '@/lib/billing'
import { getSupabase } from '@/lib/supabase'

/**
 * Painel administrativo. Os dados vêm da Edge Function "admin", que confere
 * no servidor se o usuário é administrador — esconder a tela no navegador
 * é só conveniência, não proteção.
 */

export type Kpis = {
  activeSubscribers: number
  pendingSubscriptions: number
  cancelledThisMonth: number
  mrr: number
  arpu: number
  revenueMonth: number
  revenuePrevMonth: number
  revenueGrowth: number | null
  revenueTotal: number
  approvedPaymentsMonth: number
  failedPaymentsMonth: number
  users: number
  newUsersMonth: number
  conversionRate: number
  churnRate: number
  leads: number
  newLeadsMonth: number
}

export type SeriesPoint = { month: string; label: string; revenue: number; newSubscribers: number; cancellations: number }

export type PaymentRow = {
  id: string
  user_id: string | null
  external_payment_id?: string
  amount: number
  status: string
  status_detail?: string | null
  paid_at: string | null
  created_at: string
  full_name?: string
  email?: string
}

export type Overview = { generatedAt: string; kpis: Kpis; series: SeriesPoint[]; recentPayments: PaymentRow[] }

export type SubscriberRow = {
  id: string
  full_name: string
  email: string
  state: string | null
  city: string | null
  created_at: string
  is_admin: boolean
  status: 'active' | 'pending' | 'paused' | 'cancelled' | 'expired' | 'none'
  started_at: string | null
  next_payment_at: string | null
  cancelled_at: string | null
  total_paid: number
  last_paid_at: string | null
}

export type SubscriberDetail = {
  profile: { id: string; full_name: string; email: string; state: string | null; city: string | null; created_at: string; terms_accepted_at: string | null }
  subscriptions: { id: string; status: string; provider_status: string | null; external_subscription_id: string | null; started_at: string | null; next_payment_at: string | null; cancelled_at: string | null; created_at: string }[]
  payments: PaymentRow[]
  emails: { kind: string; subject: string | null; status: string; created_at: string }[]
}

export type LeadRow = { id: string; name: string; email: string; state: string | null; city: string | null; source: string; created_at: string; registered: boolean }

const admin = <T>(action: string, extra: Record<string, unknown> = {}) => call<T>('admin', { action, ...extra })

export const adminApi = {
  overview: () => admin<Overview>('overview'),
  subscribers: () => admin<{ rows: SubscriberRow[] }>('subscribers'),
  subscriber: (userId: string) => admin<SubscriberDetail>('subscriber', { user_id: userId }),
  payments: () => admin<{ rows: PaymentRow[] }>('payments'),
  leads: () => admin<{ rows: LeadRow[] }>('leads'),
  sync: (userId: string) => admin<{ ok: true }>('sync', { user_id: userId }),
  cancel: (userId: string) => admin<{ ok: true }>('cancel', { user_id: userId }),
}

/** Só para decidir se o link do painel aparece (RLS: lê apenas o próprio registro). */
export async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await getSupabase().from('admins').select('user_id').eq('user_id', userId).maybeSingle()
  return Boolean(data)
}

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function shortDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: 'America/Fortaleza',
  })
}

export const subscriptionLabels: Record<string, { label: string; tone: 'success' | 'warning' | 'neutral' | 'brand' | 'signal' }> = {
  active: { label: 'Ativa', tone: 'success' },
  pending: { label: 'Pendente', tone: 'warning' },
  paused: { label: 'Pausada', tone: 'signal' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
  expired: { label: 'Expirada', tone: 'neutral' },
  none: { label: 'Sem assinatura', tone: 'brand' },
}

export const paymentLabels: Record<string, { label: string; tone: 'success' | 'warning' | 'neutral' | 'brand' | 'signal' }> = {
  approved: { label: 'Aprovado', tone: 'success' },
  authorized: { label: 'Autorizado', tone: 'signal' },
  pending: { label: 'Pendente', tone: 'warning' },
  in_process: { label: 'Em análise', tone: 'warning' },
  in_mediation: { label: 'Em disputa', tone: 'warning' },
  rejected: { label: 'Recusado', tone: 'neutral' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
  refunded: { label: 'Estornado', tone: 'neutral' },
  charged_back: { label: 'Contestado', tone: 'neutral' },
}

/** Gera e baixa um CSV (separador ";" para abrir direto no Excel em português). */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    // Evita injeção de fórmulas ao abrir no Excel
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
    return /[;"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  const content = '﻿' + [header, ...rows].map((r) => r.map(esc).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
