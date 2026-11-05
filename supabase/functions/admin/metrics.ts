/**
 * Cálculo dos indicadores do painel administrativo (função pura, testável).
 * Meses são contados no fuso de Fortaleza (UTC-3, sem horário de verão).
 */

export type OverviewInput = {
  now: Date
  adminIds: Set<string>
  profiles: { id: string; created_at: string }[]
  subscriptions: { id: string; user_id: string; plan_id: string; status: string; started_at: string | null; cancelled_at: string | null; created_at: string }[]
  payments: { id: string; user_id: string | null; amount: number | string; status: string; paid_at: string | null; created_at: string }[]
  leads: { id: string; created_at: string }[]
  plans: { id: string; price: number | string; is_active: boolean }[]
}

const OFFSET_MS = 3 * 60 * 60 * 1000
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function monthKey(iso: string | Date): string {
  const d = new Date(new Date(iso).getTime() - OFFSET_MS)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function lastMonths(now: Date, n: number): string[] {
  const d = new Date(now.getTime() - OFFSET_MS)
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1))
    out.push(`${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

function label(key: string): string {
  const [y, m] = key.split('-')
  return `${MONTHS[Number(m) - 1]}/${y.slice(2)}`
}

const round = (v: number) => Math.round(v * 100) / 100
const ratio = (a: number, b: number) => (b > 0 ? round((a / b) * 100) : 0)

export function buildOverview(input: OverviewInput) {
  const { now, adminIds } = input
  const current = monthKey(now)
  const months = lastMonths(now, 6)
  const previous = months[months.length - 2]

  const users = input.profiles.filter((p) => !adminIds.has(p.id))
  const subs = input.subscriptions.filter((s) => !adminIds.has(s.user_id))
  const pays = input.payments.filter((p) => !p.user_id || !adminIds.has(p.user_id))
  const price = new Map(input.plans.map((p) => [p.id, Number(p.price)]))

  const active = subs.filter((s) => s.status === 'active')
  const activeUsers = new Set(active.map((s) => s.user_id))
  const pending = subs.filter((s) => s.status === 'pending')
  const cancelledMonth = subs.filter((s) => s.status === 'cancelled' && s.cancelled_at && monthKey(s.cancelled_at) === current)
  const mrr = round(active.reduce((sum, s) => sum + (price.get(s.plan_id) ?? 0), 0))

  const approved = pays.filter((p) => p.status === 'approved')
  const paidMonth = (p: (typeof approved)[number]) => monthKey(p.paid_at ?? p.created_at)
  const revenueBy = new Map<string, number>()
  for (const p of approved) revenueBy.set(paidMonth(p), (revenueBy.get(paidMonth(p)) ?? 0) + Number(p.amount))
  const startsBy = new Map<string, number>()
  for (const s of subs) if (s.started_at) startsBy.set(monthKey(s.started_at), (startsBy.get(monthKey(s.started_at)) ?? 0) + 1)
  const cancelsBy = new Map<string, number>()
  for (const s of subs) if (s.cancelled_at && s.status === 'cancelled') cancelsBy.set(monthKey(s.cancelled_at), (cancelsBy.get(monthKey(s.cancelled_at)) ?? 0) + 1)

  const revenueMonth = round(revenueBy.get(current) ?? 0)
  const revenuePrev = round(revenueBy.get(previous) ?? 0)

  return {
    generatedAt: now.toISOString(),
    kpis: {
      activeSubscribers: activeUsers.size,
      pendingSubscriptions: pending.length,
      cancelledThisMonth: cancelledMonth.length,
      mrr,
      arpu: activeUsers.size ? round(mrr / activeUsers.size) : 0,
      revenueMonth,
      revenuePrevMonth: revenuePrev,
      revenueGrowth: revenuePrev > 0 ? round(((revenueMonth - revenuePrev) / revenuePrev) * 100) : null,
      revenueTotal: round(approved.reduce((sum, p) => sum + Number(p.amount), 0)),
      approvedPaymentsMonth: approved.filter((p) => paidMonth(p) === current).length,
      failedPaymentsMonth: pays.filter((p) => p.status === 'rejected' && monthKey(p.created_at) === current).length,
      users: users.length,
      newUsersMonth: users.filter((u) => monthKey(u.created_at) === current).length,
      conversionRate: ratio(activeUsers.size, users.length),
      churnRate: ratio(cancelledMonth.length, activeUsers.size + cancelledMonth.length),
      leads: input.leads.length,
      newLeadsMonth: input.leads.filter((l) => monthKey(l.created_at) === current).length,
    },
    series: months.map((m) => ({
      month: m,
      label: label(m),
      revenue: round(revenueBy.get(m) ?? 0),
      newSubscribers: startsBy.get(m) ?? 0,
      cancellations: cancelsBy.get(m) ?? 0,
    })),
  }
}
