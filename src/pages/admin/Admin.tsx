import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert } from '@/components/forms/Alert'
import { Badge, Button, Container, Icon, Logo } from '@/components/ui'
import { useSession } from '@/hooks/useSession'
import {
  adminApi,
  brl,
  downloadCsv,
  isAdmin,
  paymentLabels,
  shortDate,
  subscriptionLabels,
  type LeadRow,
  type Overview,
  type PaymentRow,
  type SubscriberDetail,
  type SubscriberRow,
} from '@/lib/admin'
import { signOut } from '@/lib/auth'
import { cn } from '@/utils/cn'
import { MfaGate } from './Mfa'
import { inputClass, Kpi, Modal, Panel, RevenueChart, StatusBadge, Table, td } from './parts'

type Tab = 'geral' | 'assinantes' | 'pagamentos' | 'leads'
const tabs: { id: Tab; label: string }[] = [
  { id: 'geral', label: 'Visão geral' },
  { id: 'assinantes', label: 'Assinantes' },
  { id: 'pagamentos', label: 'Pagamentos' },
  { id: 'leads', label: 'Leads' },
]

function initialTab(): Tab {
  const t = new URLSearchParams(window.location.search).get('aba') as Tab | null
  return tabs.some((x) => x.id === t) ? (t as Tab) : 'geral'
}

/** Painel administrativo: indicadores e gestão de assinantes. */
export function Admin() {
  const { session, loading } = useSession()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [tab, setTab] = useState<Tab>(initialTab)

  useEffect(() => {
    document.title = 'Painel administrativo · AtualidadeAI Concursos'
  }, [])

  useEffect(() => {
    if (loading) return
    if (!session) {
      window.location.replace('/entrar?next=/admin')
      return
    }
    isAdmin(session.user.id).then(setAllowed)
  }, [session, loading])

  function selectTab(t: Tab) {
    setTab(t)
    const url = new URL(window.location.href)
    url.searchParams.set('aba', t)
    window.history.replaceState(null, '', url)
  }

  async function logout() {
    await signOut()
    window.location.assign('/')
  }

  if (loading || !session || allowed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Carregando">
        <span className="size-8 animate-spin rounded-full border-2 border-brand-400/30 border-t-brand-400" />
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-3xl border border-white/10 bg-navy-900/85 p-8 text-center">
          <Icon name="shield" className="mx-auto size-10 text-warning-400" />
          <h1 className="mt-4 text-2xl font-bold">Acesso restrito</h1>
          <p className="mt-2 text-sm text-slate-400">Esta área é exclusiva para administradores.</p>
          <Button href="/conta" variant="secondary" className="mt-6">
            Ir para minha conta
          </Button>
        </div>
      </div>
    )
  }

  return (
    <MfaGate>
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-navy-950/90 backdrop-blur">
        <Container className="flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <a href="/" aria-label="Ir para o site">
              <Logo />
            </a>
            <span className="hidden sm:block">
              <Badge tone="signal">Admin</Badge>
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="mr-2 hidden truncate text-sm text-slate-400 md:inline">{session.user.email}</span>
            <Button href="/" variant="ghost" size="sm">
              Ver site
            </Button>
            <Button variant="ghost" size="sm" onClick={logout}>
              Sair
            </Button>
          </div>
        </Container>
        <Container>
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Seções do painel">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={cn(
                  'shrink-0 border-b-2 px-4 py-3 text-sm font-semibold transition-colors',
                  tab === t.id ? 'border-brand-400 text-white' : 'border-transparent text-slate-400 hover:text-white',
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </Container>
      </header>

      <main className="py-8">
        <Container className="space-y-6">
          <Alert tone="warning">
            <strong>Ambiente de teste.</strong> Os pagamentos exibidos vêm do sandbox do Mercado Pago e não representam receita real.
          </Alert>
          {tab === 'geral' && <OverviewTab />}
          {tab === 'assinantes' && <SubscribersTab />}
          {tab === 'pagamentos' && <PaymentsTab />}
          {tab === 'leads' && <LeadsTab />}
        </Container>
      </main>
    </div>
    </MfaGate>
  )
}

/* ------------------------------------------------------------------ */

function useLoad<T>(loader: () => Promise<{ ok: true; data: T } | { ok: false; message: string }>) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const reload = useCallback(() => {
    setBusy(true)
    loader().then((r) => {
      if (r.ok) {
        setData(r.data)
        setError(null)
      } else setError(r.message)
      setBusy(false)
    })
  }, [])
  useEffect(reload, [reload])
  return { data, error, busy, reload }
}

function Loading() {
  return (
    <p className="py-16 text-center text-sm text-slate-400" role="status">
      Carregando…
    </p>
  )
}

function RefreshButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick} disabled={busy}>
      {busy ? 'Atualizando…' : 'Atualizar'}
    </Button>
  )
}

const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

function OverviewTab() {
  const { data, error, busy, reload } = useLoad<Overview>(adminApi.overview)
  if (error) return <Alert tone="error">{error}</Alert>
  if (!data) return <Loading />
  const k = data.kpis
  const growth =
    k.revenueGrowth === null ? 'sem receita no mês anterior' : `${k.revenueGrowth >= 0 ? '+' : ''}${pct(k.revenueGrowth)} vs. mês anterior (${brl(k.revenuePrevMonth)})`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400">Atualizado em {shortDate(data.generatedAt, true)}</p>
        <RefreshButton onClick={reload} busy={busy} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Assinantes ativos" value={String(k.activeSubscribers)} hint={`${k.pendingSubscriptions} aguardando pagamento`} />
        <Kpi label="Receita recorrente (MRR)" value={brl(k.mrr)} hint={`Ticket médio ${brl(k.arpu)}`} />
        <Kpi label="Receita do mês" value={brl(k.revenueMonth)} hint={growth} tone={k.revenueGrowth !== null && k.revenueGrowth < 0 ? 'bad' : 'default'} />
        <Kpi label="Receita total" value={brl(k.revenueTotal)} hint={`${k.approvedPaymentsMonth} pagamento(s) aprovado(s) no mês`} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Cadastros" value={String(k.users)} hint={`+${k.newUsersMonth} no mês`} />
        <Kpi label="Conversão" value={pct(k.conversionRate)} hint="cadastros que assinam" />
        <Kpi label="Cancelamentos" value={String(k.cancelledThisMonth)} hint={`churn de ${pct(k.churnRate)} no mês`} tone={k.cancelledThisMonth > 0 ? 'bad' : 'default'} />
        <Kpi label="Pag. recusados" value={String(k.failedPaymentsMonth)} hint="no mês" tone={k.failedPaymentsMonth > 0 ? 'bad' : 'default'} />
        <Kpi label="Leads" value={String(k.leads)} hint={`+${k.newLeadsMonth} no mês`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Receita por mês (últimos 6 meses)">
          <RevenueChart series={data.series} />
          <dl className="mt-5 grid grid-cols-6 gap-2 text-center text-xs">
            {data.series.map((p) => (
              <div key={p.month} className="min-w-0">
                <dt className="sr-only">{p.label}</dt>
                <dd className="text-success-400" title="Novas assinaturas">
                  +{p.newSubscribers}
                </dd>
                <dd className="text-slate-500" title="Cancelamentos">
                  −{p.cancellations}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-slate-500">Abaixo de cada mês: novas assinaturas (verde) e cancelamentos (cinza).</p>
        </Panel>

        <Panel title="Últimos pagamentos">
          {data.recentPayments.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Nenhum pagamento registrado ainda.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {data.recentPayments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{p.full_name || p.email || 'Usuário removido'}</p>
                    <p className="text-xs text-slate-400">{shortDate(p.paid_at ?? p.created_at, true)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-semibold">{brl(Number(p.amount))}</span>
                    <StatusBadge status={p.status} kind="payment" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

const statusFilters = [
  { value: '', label: 'Todos os status' },
  { value: 'active', label: 'Ativas' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'cancelled', label: 'Canceladas' },
  { value: 'none', label: 'Sem assinatura' },
]

function SubscribersTab() {
  const { data, error, busy, reload } = useLoad(adminApi.subscribers)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data?.rows ?? []).filter(
      (r) =>
        (!status || r.status === status) &&
        (!q || r.full_name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || (r.city ?? '').toLowerCase().includes(q)),
    )
  }, [data, query, status])

  function exportCsv() {
    downloadCsv(
      'assinantes.csv',
      ['Nome', 'E-mail', 'UF', 'Cidade', 'Status', 'Cadastro', 'Início', 'Próxima cobrança', 'Cancelada em', 'Total pago (R$)'],
      rows.map((r: SubscriberRow) => [
        r.full_name,
        r.email,
        r.state,
        r.city,
        subscriptionLabels[r.status]?.label ?? r.status,
        shortDate(r.created_at),
        shortDate(r.started_at),
        shortDate(r.next_payment_at),
        shortDate(r.cancelled_at),
        r.total_paid.toFixed(2).replace('.', ','),
      ]),
    )
  }

  if (error) return <Alert tone="error">{error}</Alert>
  if (!data) return <Loading />

  return (
    <Panel
      title={`Assinantes e cadastros (${rows.length})`}
      action={
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!rows.length}>
            Exportar CSV
          </Button>
          <RefreshButton onClick={reload} busy={busy} />
        </div>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px]">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome, e-mail ou cidade" className={inputClass} aria-label="Buscar assinante" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass} aria-label="Filtrar por status">
          {statusFilters.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <Table head={['Assinante', 'Local', 'Status', 'Cadastro', 'Próx. cobrança', 'Total pago']} empty={!rows.length}>
        {rows.map((r) => (
          <tr key={r.id} className="cursor-pointer hover:bg-white/[0.03]" onClick={() => setSelected(r.id)}>
            <td className={td}>
              <button type="button" className="text-left" onClick={() => setSelected(r.id)}>
                <span className="block font-medium text-white">
                  {r.full_name || '—'} {r.is_admin && <span className="text-xs font-semibold text-signal-300">(admin)</span>}
                </span>
                <span className="block text-xs text-slate-400">{r.email}</span>
              </button>
            </td>
            <td className={cn(td, 'text-slate-300')}>{r.city ? `${r.city}/${r.state}` : r.state || '—'}</td>
            <td className={td}>
              <StatusBadge status={r.status} />
            </td>
            <td className={cn(td, 'text-slate-300')}>{shortDate(r.created_at)}</td>
            <td className={cn(td, 'text-slate-300')}>{r.status === 'active' ? shortDate(r.next_payment_at) : '—'}</td>
            <td className={cn(td, 'font-semibold')}>{brl(r.total_paid)}</td>
          </tr>
        ))}
      </Table>
      {selected && (
        <SubscriberModal
          userId={selected}
          onClose={() => setSelected(null)}
          onChanged={reload}
        />
      )}
    </Panel>
  )
}

function SubscriberModal({ userId, onClose, onChanged }: { userId: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<SubscriberDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [working, setWorking] = useState<'sync' | 'cancel' | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const load = useCallback(() => {
    adminApi.subscriber(userId).then((r) => (r.ok ? setDetail(r.data) : setError(r.message)))
  }, [userId])
  useEffect(load, [load])

  async function run(kind: 'sync' | 'cancel') {
    setWorking(kind)
    setNotice(null)
    setError(null)
    const r = kind === 'sync' ? await adminApi.sync(userId) : await adminApi.cancel(userId)
    setWorking(null)
    setConfirmCancel(false)
    if (!r.ok) return setError(r.message)
    setNotice(kind === 'sync' ? 'Dados atualizados com o Mercado Pago.' : 'Assinatura cancelada. Não haverá novas cobranças.')
    load()
    onChanged()
  }

  const current = detail?.subscriptions[0]
  const cancellable = current && ['active', 'pending', 'paused'].includes(current.status)

  return (
    <Modal title={detail?.profile.full_name || 'Assinante'} onClose={onClose}>
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}
      {notice && <Alert tone="success" className="mb-4">{notice}</Alert>}
      {!detail ? (
        !error && <Loading />
      ) : (
        <div className="space-y-6 text-sm">
          <dl className="divide-y divide-white/8 rounded-2xl border border-white/10">
            {[
              ['E-mail', detail.profile.email],
              ['Local', [detail.profile.city, detail.profile.state].filter(Boolean).join('/') || '—'],
              ['Cadastro', shortDate(detail.profile.created_at, true)],
              ['Aceite dos termos', shortDate(detail.profile.terms_accepted_at, true)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-slate-400">{k}</dt>
                <dd className="break-all text-right text-slate-100">{v}</dd>
              </div>
            ))}
          </dl>

          <section>
            <h3 className="mb-2 font-semibold text-white">Assinatura</h3>
            {!current ? (
              <p className="text-slate-400">Este usuário ainda não contratou.</p>
            ) : (
              <div className="space-y-3 rounded-2xl border border-white/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <StatusBadge status={current.status} />
                  <span className="text-xs text-slate-500">Mercado Pago: {current.provider_status ?? '—'}</span>
                </div>
                <p className="text-slate-300">
                  Início: {shortDate(current.started_at)} · Próxima cobrança: {current.status === 'active' ? shortDate(current.next_payment_at) : '—'}
                  {current.cancelled_at && <> · Cancelada em {shortDate(current.cancelled_at)}</>}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {current.external_subscription_id && (
                    <Button variant="secondary" size="sm" onClick={() => run('sync')} disabled={working !== null}>
                      {working === 'sync' ? 'Atualizando…' : 'Atualizar pelo Mercado Pago'}
                    </Button>
                  )}
                  {cancellable &&
                    (confirmCancel ? (
                      <>
                        <button
                          type="button"
                          onClick={() => run('cancel')}
                          disabled={working !== null}
                          className="inline-flex h-9 items-center rounded-xl bg-danger-400 px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                        >
                          {working === 'cancel' ? 'Cancelando…' : 'Confirmar cancelamento'}
                        </button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(false)} disabled={working !== null}>
                          Voltar
                        </Button>
                      </>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(true)} disabled={working !== null}>
                        Cancelar assinatura
                      </Button>
                    ))}
                </div>
                {confirmCancel && <p className="text-xs text-warning-400">O cancelamento interrompe as próximas cobranças no Mercado Pago e não pode ser desfeito.</p>}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-white">Pagamentos ({detail.payments.length})</h3>
            {detail.payments.length === 0 ? (
              <p className="text-slate-400">Nenhum pagamento.</p>
            ) : (
              <ul className="divide-y divide-white/5 rounded-2xl border border-white/10">
                {detail.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="text-slate-300">{shortDate(p.paid_at ?? p.created_at, true)}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold">{brl(Number(p.amount))}</span>
                      <StatusBadge status={p.status} kind="payment" />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-white">E-mails enviados ({detail.emails.length})</h3>
            {detail.emails.length === 0 ? (
              <p className="text-slate-400">Nenhum e-mail transacional.</p>
            ) : (
              <ul className="space-y-1 text-slate-300">
                {detail.emails.map((e, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="truncate">{e.subject ?? e.kind}</span>
                    <span className={cn('shrink-0 text-xs', e.status === 'sent' ? 'text-success-400' : 'text-warning-400')}>
                      {e.status === 'sent' ? 'enviado' : e.status} · {shortDate(e.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  )
}

/* ------------------------------------------------------------------ */

function PaymentsTab() {
  const { data, error, busy, reload } = useLoad(adminApi.payments)
  if (error) return <Alert tone="error">{error}</Alert>
  if (!data) return <Loading />
  const rows: PaymentRow[] = data.rows

  function exportCsv() {
    downloadCsv(
      'pagamentos.csv',
      ['Data', 'Assinante', 'E-mail', 'Valor (R$)', 'Status', 'Detalhe', 'ID Mercado Pago'],
      rows.map((p) => [
        shortDate(p.paid_at ?? p.created_at, true),
        p.full_name,
        p.email,
        Number(p.amount).toFixed(2).replace('.', ','),
        paymentLabels[p.status]?.label ?? p.status,
        p.status_detail,
        p.external_payment_id,
      ]),
    )
  }

  return (
    <Panel
      title={`Pagamentos (${rows.length})`}
      action={
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!rows.length}>
            Exportar CSV
          </Button>
          <RefreshButton onClick={reload} busy={busy} />
        </div>
      }
    >
      <Table head={['Data', 'Assinante', 'Valor', 'Status', 'ID Mercado Pago']} empty={!rows.length}>
        {rows.map((p) => (
          <tr key={p.id}>
            <td className={cn(td, 'text-slate-300')}>{shortDate(p.paid_at ?? p.created_at, true)}</td>
            <td className={td}>
              <span className="block font-medium text-white">{p.full_name || 'Usuário removido'}</span>
              <span className="block text-xs text-slate-400">{p.email ?? ''}</span>
            </td>
            <td className={cn(td, 'font-semibold')}>{brl(Number(p.amount))}</td>
            <td className={td}>
              <StatusBadge status={p.status} kind="payment" />
            </td>
            <td className={cn(td, 'font-mono text-xs text-slate-400')}>{p.external_payment_id}</td>
          </tr>
        ))}
      </Table>
    </Panel>
  )
}

function LeadsTab() {
  const { data, error, busy, reload } = useLoad(adminApi.leads)
  if (error) return <Alert tone="error">{error}</Alert>
  if (!data) return <Loading />
  const rows: LeadRow[] = data.rows

  function exportCsv() {
    downloadCsv(
      'leads.csv',
      ['Nome', 'E-mail', 'UF', 'Cidade', 'Origem', 'Data', 'Já cadastrado'],
      rows.map((l) => [l.name, l.email, l.state, l.city, l.source, shortDate(l.created_at, true), l.registered ? 'sim' : 'não']),
    )
  }

  return (
    <Panel
      title={`Leads (${rows.length})`}
      action={
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!rows.length}>
            Exportar CSV
          </Button>
          <RefreshButton onClick={reload} busy={busy} />
        </div>
      }
    >
      <p className="mb-4 text-sm text-slate-400">Pessoas que começaram o cadastro na landing. "Não cadastrado" indica quem ainda não concluiu a conta — bons contatos para retomar.</p>
      <Table head={['Nome', 'Local', 'Data', 'Situação']} empty={!rows.length}>
        {rows.map((l) => (
          <tr key={l.id}>
            <td className={td}>
              <span className="block font-medium text-white">{l.name}</span>
              <span className="block text-xs text-slate-400">{l.email}</span>
            </td>
            <td className={cn(td, 'text-slate-300')}>{l.city ? `${l.city}/${l.state}` : l.state || '—'}</td>
            <td className={cn(td, 'text-slate-300')}>{shortDate(l.created_at, true)}</td>
            <td className={td}>
              <Badge tone={l.registered ? 'success' : 'warning'} className="normal-case tracking-normal">
                {l.registered ? 'Cadastrado' : 'Não cadastrado'}
              </Badge>
            </td>
          </tr>
        ))}
      </Table>
    </Panel>
  )
}
