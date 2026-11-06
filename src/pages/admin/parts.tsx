import { useEffect, type ReactNode } from 'react'
import { Badge, Icon } from '@/components/ui'
import { paymentLabels, subscriptionLabels, type SeriesPoint, brl } from '@/lib/admin'
import { cn } from '@/utils/cn'

/** Blocos visuais reutilizados pelas abas do painel. */

export function Panel({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-white/10 bg-navy-900/70 p-5 sm:p-6', className)}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="font-display text-base font-semibold text-white">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Kpi({ label, value, hint, tone = 'default' }: { label: string; value: string; hint?: ReactNode; tone?: 'default' | 'good' | 'bad' }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-navy-900/70 p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={cn('mt-2 truncate font-display text-2xl font-bold sm:text-3xl', tone === 'good' ? 'text-success-400' : tone === 'bad' ? 'text-warning-400' : 'text-white')}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

export function StatusBadge({ status, kind = 'subscription' }: { status: string; kind?: 'subscription' | 'payment' }) {
  const s = (kind === 'payment' ? paymentLabels : subscriptionLabels)[status] ?? { label: status, tone: 'neutral' as const }
  return (
    <Badge tone={s.tone} className="whitespace-nowrap normal-case tracking-normal">
      {s.label}
    </Badge>
  )
}

/** Gráfico de barras simples (sem biblioteca): receita por mês. */
export function RevenueChart({ series }: { series: SeriesPoint[] }) {
  const max = Math.max(...series.map((p) => p.revenue), 1)
  return (
    <div>
      <div className="flex h-48 items-end gap-2 sm:gap-4" role="list" aria-label="Receita por mês">
        {series.map((p) => (
          <div key={p.month} role="listitem" className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2" aria-label={`${p.label}: ${brl(p.revenue)}`}>
            <span className="truncate text-[11px] font-semibold text-slate-300">{p.revenue > 0 ? brl(p.revenue) : ''}</span>
            <div
              className="w-full max-w-14 rounded-t-lg bg-gradient-to-t from-brand-600 to-brand-400"
              style={{ height: `${Math.max((p.revenue / max) * 100, p.revenue > 0 ? 4 : 1)}%`, opacity: p.revenue > 0 ? 1 : 0.25 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2 border-t border-white/10 pt-2 sm:gap-4">
        {series.map((p) => (
          <span key={p.month} className="flex-1 text-center text-xs text-slate-400">
            {p.label}
          </span>
        ))}
      </div>
    </div>
  )
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="-mx-5 overflow-x-auto sm:-mx-6">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-400">
            {head.map((h) => (
              <th key={h} scope="col" className="px-5 py-3 font-semibold first:pl-5 sm:px-6">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">{children}</tbody>
      </table>
      {empty && <p className="px-6 py-10 text-center text-sm text-slate-400">Nenhum registro encontrado.</p>}
    </div>
  )
}

export const td = 'px-5 py-3 align-middle sm:px-6'

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-navy-950/70 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn('h-full w-full overflow-y-auto border-l border-white/10 bg-navy-900 p-5 shadow-card sm:p-7', wide ? 'max-w-3xl' : 'max-w-xl')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <h2 className="font-display text-xl font-bold text-white">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Fechar">
            <Icon name="close" className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export const inputClass =
  'h-11 w-full rounded-xl border border-white/10 bg-navy-950/60 px-4 text-sm text-white placeholder:text-slate-500 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/30'
