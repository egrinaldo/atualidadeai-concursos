import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

type Tone = 'brand' | 'signal' | 'success' | 'warning' | 'neutral'

const tones: Record<Tone, string> = {
  brand: 'border-brand-400/30 bg-brand-500/10 text-brand-300',
  signal: 'border-signal-400/30 bg-signal-400/10 text-signal-300',
  success: 'border-success-400/30 bg-success-400/10 text-success-400',
  warning: 'border-warning-400/30 bg-warning-400/10 text-warning-400',
  neutral: 'border-white/10 bg-white/5 text-slate-300',
}

type BadgeProps = {
  tone?: Tone
  dot?: boolean
  className?: string
  children: ReactNode
}

/** Etiqueta curta (ex.: "EXEMPLO", "Ao vivo", status de configuração). */
export function Badge({ tone = 'brand', dot = false, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider',
        tones[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 animate-pulse-dot rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
}
