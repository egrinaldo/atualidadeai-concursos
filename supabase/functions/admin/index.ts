/**
 * POST /functions/v1/admin   (requer usuário logado E cadastrado em public.admins)
 *
 * Backend do painel administrativo. Toda leitura usa a chave de serviço,
 * mas só depois de confirmar que quem chama é administrador.
 *
 * Corpo: { action, ...parâmetros }
 *   overview                 → indicadores (assinantes, receita, conversão, séries)
 *   subscribers              → lista de cadastrados com a situação da assinatura
 *   subscriber { user_id }   → detalhes: perfil, assinaturas, pagamentos, e-mails
 *   payments                 → últimos pagamentos
 *   leads                    → interessados captados na landing
 *   sync   { user_id }       → atualiza a assinatura consultando o Mercado Pago
 *   cancel { user_id }       → cancela a assinatura no Mercado Pago
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminClient, logEvent, userFromRequest } from '../_shared/db.ts'
import { errorMessage, json, preflight } from '../_shared/http.ts'
import { isUuid } from '../_shared/mapping.ts'
import { MercadoPago } from '../_shared/mercadopago.ts'
import { applyPreapproval, fullSync } from '../_shared/sync.ts'
import { buildOverview, type OverviewInput } from './metrics.ts'

const MAX_ROWS = 5000

type Row = Record<string, unknown>

async function all(db: SupabaseClient, table: string, columns: string, order = 'created_at'): Promise<Row[]> {
  const { data, error } = await db.from(table).select(columns).order(order, { ascending: false }).limit(MAX_ROWS)
  if (error) throw new Error(`${table}: ${error.message}`)
  return (data ?? []) as unknown as Row[]
}

async function adminIds(db: SupabaseClient): Promise<Set<string>> {
  const { data } = await db.from('admins').select('user_id')
  return new Set((data ?? []).map((r) => r.user_id as string))
}

async function overview(db: SupabaseClient) {
  const [admins, profiles, subscriptions, payments, leads, plans] = await Promise.all([
    adminIds(db),
    all(db, 'profiles', 'id, created_at'),
    all(db, 'subscriptions', 'id, user_id, plan_id, status, started_at, cancelled_at, created_at'),
    all(db, 'payments', 'id, user_id, amount, status, paid_at, created_at'),
    all(db, 'leads', 'id, created_at'),
    all(db, 'plans', 'id, price, is_active'),
  ])
  const input: OverviewInput = {
    now: new Date(),
    adminIds: admins,
    profiles: profiles as OverviewInput['profiles'],
    subscriptions: subscriptions as OverviewInput['subscriptions'],
    payments: payments as OverviewInput['payments'],
    leads: leads as OverviewInput['leads'],
    plans: plans as OverviewInput['plans'],
  }
  const result = buildOverview(input)

  // Últimos pagamentos com nome do assinante
  const recent = payments.slice(0, 8)
  const names = await namesFor(db, recent.map((p) => p.user_id as string | null))
  return { ...result, recentPayments: recent.map((p) => ({ ...p, ...names.get(p.user_id as string) })) }
}

async function namesFor(db: SupabaseClient, ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))]
  const map = new Map<string, { full_name: string; email: string }>()
  if (!unique.length) return map
  const { data } = await db.from('profiles').select('id, full_name, email').in('id', unique)
  for (const p of data ?? []) map.set(p.id as string, { full_name: p.full_name as string, email: p.email as string })
  return map
}

async function subscribers(db: SupabaseClient) {
  const [admins, profiles, subscriptions, payments] = await Promise.all([
    adminIds(db),
    all(db, 'profiles', 'id, full_name, email, state, city, created_at'),
    all(db, 'subscriptions', 'id, user_id, status, started_at, next_payment_at, cancelled_at, created_at'),
    all(db, 'payments', 'user_id, amount, status, paid_at, created_at'),
  ])
  const latestSub = new Map<string, Row>()
  for (const s of subscriptions) if (!latestSub.has(s.user_id as string)) latestSub.set(s.user_id as string, s)
  const paid = new Map<string, { total: number; last: string | null }>()
  for (const p of payments) {
    if (p.status !== 'approved' || !p.user_id) continue
    const cur = paid.get(p.user_id as string) ?? { total: 0, last: null }
    cur.total += Number(p.amount)
    const at = (p.paid_at ?? p.created_at) as string
    if (!cur.last || at > cur.last) cur.last = at
    paid.set(p.user_id as string, cur)
  }
  return {
    rows: profiles.map((p) => {
      const s = latestSub.get(p.id as string)
      const pay = paid.get(p.id as string)
      return {
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        state: p.state,
        city: p.city,
        created_at: p.created_at,
        is_admin: admins.has(p.id as string),
        status: (s?.status as string) ?? 'none',
        started_at: s?.started_at ?? null,
        next_payment_at: s?.next_payment_at ?? null,
        cancelled_at: s?.cancelled_at ?? null,
        total_paid: Math.round((pay?.total ?? 0) * 100) / 100,
        last_paid_at: pay?.last ?? null,
      }
    }),
  }
}

async function subscriber(db: SupabaseClient, userId: string) {
  const [profile, subs, pays, emails] = await Promise.all([
    db.from('profiles').select('*').eq('id', userId).maybeSingle(),
    db.from('subscriptions').select('id, status, provider_status, external_subscription_id, started_at, next_payment_at, cancelled_at, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
    db.from('payments').select('id, external_payment_id, amount, status, status_detail, paid_at, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
    db.from('email_log').select('kind, subject, status, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
  ])
  if (!profile.data) return null
  return { profile: profile.data, subscriptions: subs.data ?? [], payments: pays.data ?? [], emails: emails.data ?? [] }
}

async function payments(db: SupabaseClient) {
  const rows = (await all(db, 'payments', 'id, user_id, external_payment_id, amount, status, status_detail, paid_at, created_at')).slice(0, 300)
  const names = await namesFor(db, rows.map((r) => r.user_id as string | null))
  return { rows: rows.map((r) => ({ ...r, ...names.get(r.user_id as string) })) }
}

async function leads(db: SupabaseClient) {
  const [rows, profiles] = await Promise.all([all(db, 'leads', 'id, name, email, state, city, source, created_at'), all(db, 'profiles', 'email')])
  const registered = new Set(profiles.map((p) => String(p.email).toLowerCase()))
  return { rows: rows.map((l) => ({ ...l, registered: registered.has(String(l.email).toLowerCase()) })) }
}

async function latestSubscription(db: SupabaseClient, userId: string, statuses?: string[]) {
  let q = db.from('subscriptions').select('id, external_subscription_id').eq('user_id', userId)
  if (statuses) q = q.in('status', statuses)
  const { data } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const db = adminClient()
  const user = await userFromRequest(req, db)
  if (!user) return json({ error: 'Faça login.' }, 401)

  const { data: isAdmin } = await db.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!isAdmin) return json({ error: 'Acesso restrito a administradores.' }, 403)

  const body = await req.json().catch(() => ({})) as { action?: string; user_id?: string }
  const action = body.action ?? ''
  const userId = body.user_id ?? ''
  if (['subscriber', 'sync', 'cancel'].includes(action) && !isUuid(userId)) {
    return json({ error: 'Assinante inválido.' }, 400)
  }

  try {
    switch (action) {
      case 'overview':
        return json(await overview(db))
      case 'subscribers':
        return json(await subscribers(db))
      case 'subscriber': {
        const detail = await subscriber(db, userId)
        return detail ? json(detail) : json({ error: 'Assinante não encontrado.' }, 404)
      }
      case 'payments':
        return json(await payments(db))
      case 'leads':
        return json(await leads(db))
      case 'sync': {
        const sub = await latestSubscription(db, userId)
        if (!sub?.external_subscription_id) return json({ error: 'Este usuário não tem assinatura no Mercado Pago.' }, 404)
        await fullSync(db, sub.external_subscription_id)
        await logEvent(db, { source: 'sync', topic: 'preapproval', action: 'admin_sync', resource_id: sub.external_subscription_id, status: 'processed' })
        return json({ ok: true })
      }
      case 'cancel': {
        const sub = await latestSubscription(db, userId, ['active', 'pending', 'paused'])
        if (!sub) return json({ error: 'Nenhuma assinatura ativa ou pendente para cancelar.' }, 404)
        if (sub.external_subscription_id) {
          const updated = await MercadoPago.updatePreapproval(sub.external_subscription_id, { status: 'cancelled' })
          await applyPreapproval(db, updated)
        } else {
          await db.from('subscriptions').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', sub.id)
        }
        await logEvent(db, { source: 'sync', topic: 'preapproval', action: `admin_cancel:${user.id}`, resource_id: sub.external_subscription_id, status: 'processed' })
        return json({ ok: true })
      }
      default:
        return json({ error: 'Ação desconhecida.' }, 400)
    }
  } catch (e) {
    const msg = errorMessage(e)
    console.error('[admin]', action, msg)
    return json({ error: 'Não foi possível concluir a operação. Tente novamente.' }, 502)
  }
})
