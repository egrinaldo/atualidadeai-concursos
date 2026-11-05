import type { ReactNode } from 'react'
import { Icon, type IconName } from '@/components/ui'
import { cn } from '@/utils/cn'

type Tone = 'error' | 'success' | 'info' | 'warning'

const styles: Record<Tone, { box: string; icon: IconName }> = {
  error: { box: 'border-danger-400/40 bg-danger-400/10 text-red-100', icon: 'close' },
  success: { box: 'border-success-400/40 bg-success-400/10 text-emerald-100', icon: 'check' },
  info: { box: 'border-brand-400/40 bg-brand-500/10 text-brand-200', icon: 'lightbulb' },
  warning: { box: 'border-warning-400/40 bg-warning-400/10 text-amber-100', icon: 'shield' },
}

/** Mensagem de feedback anunciada por leitores de tela. */
export function Alert({ tone, title, children, className }: { tone: Tone; title?: string; children?: ReactNode; className?: string }) {
  const s = styles[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed', s.box, className)}
    >
      <Icon name={s.icon} className="mt-0.5 size-4 shrink-0" />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
    </div>
  )
}
