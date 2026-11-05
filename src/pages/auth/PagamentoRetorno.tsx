import { useEffect, useState } from 'react'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button, Icon, type IconName } from '@/components/ui'
import { useSession } from '@/hooks/useSession'
import { formatDate, loadBilling, syncSubscription, type BillingSnapshot } from '@/lib/billing'
import { cn } from '@/utils/cn'

type Outcome = 'success' | 'pending' | 'failure'

/**
 * Página de retorno do checkout do Mercado Pago.
 *
 * Atende /pagamento/retorno, /pagamento/sucesso, /pagamento/pendente e
 * /pagamento/falha. O resultado exibido NUNCA vem da URL: a página
 * consulta o Mercado Pago (Edge Function mp-sync) e mostra o status real
 * gravado no banco. Parâmetros de retorno podem ser forjados; a API não.
 */
export function PagamentoRetorno() {
  const { session, loading } = useSession()
  const [billing, setBilling] = useState<BillingSnapshot | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (loading) return
    if (!session) {
      window.location.replace(`/entrar?next=${encodeURIComponent('/pagamento/retorno')}`)
      return
    }
    let active = true
    ;(async () => {
      await syncSubscription()
      const b = await loadBilling()
      if (!active) return
      setBilling(b)
      // Pagamento recém-feito pode levar alguns segundos para ser confirmado
      if (b.subscription?.status === 'pending' && attempt < 3) setTimeout(() => active && setAttempt((n) => n + 1), 4000)
    })()
    return () => {
      active = false
    }
  }, [session, loading, attempt])

  if (!billing) {
    return (
      <AuthLayout title="Confirmando pagamento">
        <div className="flex flex-col items-center gap-4 py-6 text-center" role="status">
          <span className="size-10 animate-spin rounded-full border-2 border-brand-400/30 border-t-brand-400" />
          <p className="text-slate-400">Consultando o Mercado Pago…</p>
        </div>
      </AuthLayout>
    )
  }

  const sub = billing.subscription
  const last = billing.lastPayment
  const outcome: Outcome =
    sub?.status === 'active'
      ? 'success'
      : sub?.status === 'pending' && last?.status !== 'rejected'
        ? 'pending'
        : 'failure'

  const view: Record<Outcome, { title: string; icon: IconName; tone: string; text: string }> = {
    success: {
      title: 'Assinatura ativa!',
      icon: 'check',
      tone: 'bg-success-400/15 text-success-400 ring-success-400/30',
      text: `Pagamento confirmado pelo Mercado Pago. Próxima cobrança: ${formatDate(sub?.next_payment_at)}.`,
    },
    pending: {
      title: 'Pagamento em processamento',
      icon: 'clock',
      tone: 'bg-warning-400/15 text-warning-400 ring-warning-400/30',
      text: 'O Mercado Pago ainda não confirmou o pagamento. Assim que confirmar, sua assinatura será ativada automaticamente — você pode acompanhar em Minha conta.',
    },
    failure: {
      title: 'Pagamento não concluído',
      icon: 'close',
      tone: 'bg-danger-400/15 text-danger-400 ring-danger-400/30',
      text:
        last?.status === 'rejected'
          ? 'O pagamento foi recusado. Tente novamente com outro cartão.'
          : 'Não identificamos um pagamento aprovado. Nenhuma cobrança foi confirmada.',
    },
  }
  const v = view[outcome]

  return (
    <AuthLayout title={v.title}>
      <div className="space-y-6 text-center" data-outcome={outcome}>
        <div className={cn('mx-auto flex size-16 items-center justify-center rounded-2xl ring-1', v.tone)}>
          <Icon name={v.icon} className="size-8" />
        </div>
        <p className="text-slate-300">{v.text}</p>
        <Button href="/conta" size="lg" className="w-full">
          {outcome === 'failure' ? 'Tentar novamente' : 'Ir para minha conta'}
        </Button>
      </div>
    </AuthLayout>
  )
}
