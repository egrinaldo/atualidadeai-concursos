import { useEffect, useState } from 'react'
import { Alert } from '@/components/forms/Alert'
import { TextField } from '@/components/forms/Field'
import { Badge, Button, Icon } from '@/components/ui'
import { planPriceLabel } from '@/content/plans'
import { validateEmail } from '@/lib/validation'
import { cancelSubscription, formatDate, loadBilling, startCheckout, syncSubscription, type BillingSnapshot } from '@/lib/billing'
import type { Subscription } from '@/types/database'

const statusLabel: Record<Subscription['status'], { text: string; tone: 'success' | 'warning' | 'neutral' }> = {
  active: { text: 'Ativa', tone: 'success' },
  pending: { text: 'Aguardando pagamento', tone: 'warning' },
  paused: { text: 'Pausada', tone: 'warning' },
  cancelled: { text: 'Cancelada', tone: 'neutral' },
  expired: { text: 'Expirada', tone: 'neutral' },
}

const paymentLabel: Record<string, string> = {
  approved: 'aprovado',
  pending: 'pendente',
  in_process: 'em análise',
  rejected: 'recusado',
  cancelled: 'cancelado',
  refunded: 'estornado',
  charged_back: 'contestado',
}

/** Cartão de assinatura da área do assinante: contratar, acompanhar e cancelar. */
export function SubscriptionPanel({ accountEmail }: { accountEmail: string }) {
  const [billing, setBilling] = useState<BillingSnapshot | null>(null)
  const [busy, setBusy] = useState<null | 'checkout' | 'sync' | 'cancel'>(null)
  const [message, setMessage] = useState<{ tone: 'error' | 'success' | 'info'; text: string } | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [payerEmail, setPayerEmail] = useState(accountEmail)
  const [payerError, setPayerError] = useState<string>()

  async function refresh(withSync: boolean) {
    if (withSync) await syncSubscription()
    setBilling(await loadBilling())
  }

  useEffect(() => {
    // Mostra o que está no banco e, em seguida, confirma no Mercado Pago
    loadBilling().then((b) => {
      setBilling(b)
      const s = b.subscription?.status
      if (s === 'pending' || s === 'active' || s === 'paused') refresh(true)
    })
  }, [])

  async function subscribe() {
    const err = validateEmail(payerEmail)
    setPayerError(err ?? undefined)
    if (err) return
    setBusy('checkout')
    setMessage(null)
    const r = await startCheckout(payerEmail)
    if (r.ok) {
      window.location.assign(r.data.checkout_url)
      return
    }
    setBusy(null)
    setMessage({ tone: 'error', text: r.message })
  }

  async function checkStatus() {
    setBusy('sync')
    setMessage(null)
    const r = await syncSubscription()
    setBilling(await loadBilling())
    setBusy(null)
    if (!r.ok) setMessage({ tone: 'error', text: r.message })
    else if (r.data.status === 'active') setMessage({ tone: 'success', text: 'Pagamento confirmado. Sua assinatura está ativa!' })
    else setMessage({ tone: 'info', text: 'Ainda não recebemos a confirmação do pagamento. Isso pode levar alguns minutos.' })
  }

  async function cancel() {
    setBusy('cancel')
    setMessage(null)
    const r = await cancelSubscription()
    setConfirmCancel(false)
    setBilling(await loadBilling())
    setBusy(null)
    setMessage(r.ok ? { tone: 'success', text: 'Assinatura cancelada. Não haverá novas cobranças.' } : { tone: 'error', text: r.message })
  }

  if (!billing) {
    return (
      <section className="rounded-2xl border border-white/10 bg-navy-950/50 p-5" aria-busy="true">
        <p className="text-sm text-slate-400" role="status">
          Carregando assinatura…
        </p>
      </section>
    )
  }

  const sub = billing.subscription
  const status = sub ? statusLabel[sub.status] : null
  const last = billing.lastPayment
  const canSubscribe = !sub || sub.status === 'cancelled' || sub.status === 'expired'

  return (
    <section aria-labelledby="assinatura-title" className="rounded-2xl border border-white/10 bg-navy-950/50 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="assinatura-title" className="text-base font-semibold">
          Assinatura
        </h2>
        <Badge tone={status?.tone ?? 'neutral'}>{status?.text ?? 'Sem assinatura'}</Badge>
      </div>

      {message && (
        <Alert tone={message.tone} className="mt-4">
          {message.text}
        </Alert>
      )}

      {sub?.status === 'active' && (
        <div className="mt-4 space-y-3 text-sm">
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-slate-500">Ativa desde</dt>
              <dd className="text-slate-100">{formatDate(sub.started_at)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Próxima cobrança</dt>
              <dd className="text-slate-100">{formatDate(sub.next_payment_at)}</dd>
            </div>
          </dl>
          {last && (
            <p className="text-slate-400">
              Último pagamento: R$ {Number(last.amount).toFixed(2).replace('.', ',')} — {paymentLabel[last.status] ?? last.status}
            </p>
          )}
          {confirmCancel ? (
            <div className="rounded-xl border border-danger-400/30 bg-danger-400/5 p-4">
              <p className="text-slate-200">Cancelar a assinatura? As próximas cobranças serão interrompidas.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="secondary" size="sm" onClick={() => setConfirmCancel(false)} disabled={busy === 'cancel'}>
                  Manter
                </Button>
                <Button size="sm" className="bg-danger-400 text-navy-950 shadow-none hover:bg-red-300" onClick={cancel} disabled={busy === 'cancel'}>
                  {busy === 'cancel' ? 'Cancelando…' : 'Confirmar cancelamento'}
                </Button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmCancel(true)} className="text-sm text-slate-400 underline-offset-2 hover:text-white hover:underline">
              Cancelar assinatura
            </button>
          )}
        </div>
      )}

      {(sub?.status === 'pending' || sub?.status === 'paused') && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-slate-400">
            {sub.status === 'pending'
              ? 'Sua assinatura foi iniciada, mas o pagamento ainda não foi confirmado pelo Mercado Pago.'
              : 'Sua assinatura está pausada no Mercado Pago.'}
            {last?.status === 'rejected' && ' O último pagamento foi recusado — tente outro cartão.'}
          </p>
          {sub.checkout_url && sub.status === 'pending' && (
            <Button href={sub.checkout_url} className="w-full">
              Continuar pagamento <Icon name="arrowRight" className="size-4" />
            </Button>
          )}
          <Button variant="secondary" className="w-full" onClick={checkStatus} disabled={busy === 'sync'}>
            {busy === 'sync' ? 'Consultando…' : 'Já paguei — atualizar status'}
          </Button>
          <button type="button" onClick={cancel} className="block w-full text-center text-xs text-slate-500 hover:text-slate-300" disabled={busy !== null}>
            Desistir desta assinatura
          </button>
        </div>
      )}

      {canSubscribe && (
        <div className="mt-4">
          <p className="text-sm text-slate-400">
            Assine por <strong className="text-white">{planPriceLabel()}</strong> para receber os materiais diários, semanais e mensais.
          </p>
          <div className="mt-4">
            <TextField
              label="E-mail da sua conta Mercado Pago"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              value={payerEmail}
              onChange={(e) => setPayerEmail(e.target.value)}
              error={payerError}
              hint="Use o mesmo e-mail com que você entra no Mercado Pago — o pagamento só é aceito por essa conta."
            />
          </div>
          <Button className="mt-4 w-full" size="lg" onClick={subscribe} disabled={busy === 'checkout'} aria-busy={busy === 'checkout'}>
            {busy === 'checkout' ? 'Abrindo o Mercado Pago…' : sub ? 'Assinar novamente' : 'Assinar agora'}
            {busy !== 'checkout' && <Icon name="arrowRight" className="size-4.5" />}
          </Button>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
            <Icon name="shield" className="size-3.5" /> Pagamento seguro pelo Mercado Pago. Não armazenamos dados de cartão.
          </p>
        </div>
      )}
    </section>
  )
}
