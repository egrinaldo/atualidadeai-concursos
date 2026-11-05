/**
 * Testes dos indicadores do painel administrativo (sem rede).
 * Executar:  npm run test:functions
 */
import { buildOverview, monthKey } from '../admin/metrics.ts'

function assertEquals<T>(actual: T, expected: T, msg = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${msg} esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`)
}

const now = new Date('2026-11-20T15:00:00Z')
const plan = { id: 'p1', price: '10.00', is_active: true }

Deno.test('monthKey usa o fuso de Fortaleza (UTC-3)', () => {
  assertEquals(monthKey('2026-12-01T02:59:00Z'), '2026-11') // 23:59 de 30/11 em Fortaleza
  assertEquals(monthKey('2026-12-01T03:00:00Z'), '2026-12')
})

Deno.test('indicadores: assinantes, receita, conversão e exclusão do administrador', () => {
  const o = buildOverview({
    now,
    adminIds: new Set(['adm']),
    plans: [plan],
    profiles: [
      { id: 'adm', created_at: '2026-11-05T12:00:00Z' },
      { id: 'u1', created_at: '2026-10-10T12:00:00Z' },
      { id: 'u2', created_at: '2026-11-02T12:00:00Z' },
      { id: 'u3', created_at: '2026-11-03T12:00:00Z' },
      { id: 'u4', created_at: '2026-11-04T12:00:00Z' },
    ],
    subscriptions: [
      { id: 's0', user_id: 'adm', plan_id: 'p1', status: 'active', started_at: '2026-11-05T12:00:00Z', cancelled_at: null, created_at: '2026-11-05T12:00:00Z' },
      { id: 's1', user_id: 'u1', plan_id: 'p1', status: 'active', started_at: '2026-10-10T12:00:00Z', cancelled_at: null, created_at: '2026-10-10T12:00:00Z' },
      { id: 's2', user_id: 'u2', plan_id: 'p1', status: 'active', started_at: '2026-11-02T12:00:00Z', cancelled_at: null, created_at: '2026-11-02T12:00:00Z' },
      { id: 's3', user_id: 'u3', plan_id: 'p1', status: 'cancelled', started_at: '2026-11-03T12:00:00Z', cancelled_at: '2026-11-10T12:00:00Z', created_at: '2026-11-03T12:00:00Z' },
      { id: 's4', user_id: 'u4', plan_id: 'p1', status: 'pending', started_at: null, cancelled_at: null, created_at: '2026-11-04T12:00:00Z' },
    ],
    payments: [
      { id: 'x0', user_id: 'adm', amount: 10, status: 'approved', paid_at: '2026-11-05T12:00:00Z', created_at: '2026-11-05T12:00:00Z' },
      { id: 'x1', user_id: 'u1', amount: 10, status: 'approved', paid_at: '2026-10-10T12:00:00Z', created_at: '2026-10-10T12:00:00Z' },
      { id: 'x2', user_id: 'u1', amount: 10, status: 'approved', paid_at: '2026-11-10T12:00:00Z', created_at: '2026-11-10T12:00:00Z' },
      { id: 'x3', user_id: 'u2', amount: '10.00', status: 'approved', paid_at: '2026-11-02T12:00:00Z', created_at: '2026-11-02T12:00:00Z' },
      { id: 'x4', user_id: 'u3', amount: 10, status: 'approved', paid_at: '2026-11-03T12:00:00Z', created_at: '2026-11-03T12:00:00Z' },
      { id: 'x5', user_id: 'u4', amount: 10, status: 'rejected', paid_at: null, created_at: '2026-11-04T12:00:00Z' },
    ],
    leads: [
      { id: 'l1', created_at: '2026-09-01T12:00:00Z' },
      { id: 'l2', created_at: '2026-11-01T12:00:00Z' },
    ],
  })
  const k = o.kpis
  assertEquals(k.activeSubscribers, 2)
  assertEquals(k.pendingSubscriptions, 1)
  assertEquals(k.cancelledThisMonth, 1)
  assertEquals(k.mrr, 20)
  assertEquals(k.arpu, 10)
  assertEquals(k.revenueMonth, 30)
  assertEquals(k.revenuePrevMonth, 10)
  assertEquals(k.revenueGrowth, 200)
  assertEquals(k.revenueTotal, 40)
  assertEquals(k.failedPaymentsMonth, 1)
  assertEquals(k.users, 4)
  assertEquals(k.newUsersMonth, 3)
  assertEquals(k.conversionRate, 50)
  assertEquals(k.churnRate, 33.33)
  assertEquals(k.leads, 2)
  assertEquals(k.newLeadsMonth, 1)
  assertEquals(o.series.length, 6)
  assertEquals(o.series.at(-1), { month: '2026-11', label: 'nov/26', revenue: 30, newSubscribers: 2, cancellations: 1 })
  assertEquals(o.series.at(-2)?.revenue, 10)
})

Deno.test('indicadores: banco vazio não gera divisão por zero', () => {
  const o = buildOverview({ now, adminIds: new Set(), plans: [plan], profiles: [], subscriptions: [], payments: [], leads: [] })
  assertEquals(o.kpis.conversionRate, 0)
  assertEquals(o.kpis.churnRate, 0)
  assertEquals(o.kpis.arpu, 0)
  assertEquals(o.kpis.revenueGrowth, null)
})
