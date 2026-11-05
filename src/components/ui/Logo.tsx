import { cn } from '@/utils/cn'

type LogoProps = {
  className?: string
  /** Exibe somente o símbolo, sem o nome. */
  iconOnly?: boolean
}

/**
 * Logotipo provisório do AtualidadeAI Concursos (SVG inline).
 * O símbolo combina um "A" com um ponto de sinal — "atualização ao vivo".
 * Pode ser refinado na Subetapa 2.
 */
export function Logo({ className, iconOnly = false }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 64 64" className="size-9 shrink-0" aria-hidden>
        <rect width="64" height="64" rx="14" className="fill-navy-800" />
        <path
          d="M20 46 32 16l12 30"
          fill="none"
          className="stroke-brand-400"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M25 36h14" className="stroke-brand-400" strokeWidth="6" strokeLinecap="round" />
        <circle cx="47" cy="17" r="5" className="fill-signal-400" />
      </svg>
      {!iconOnly && (
        <span className="font-display text-lg leading-none font-bold text-white">
          Atualidade<span className="text-brand-400">AI</span>
          <span className="mt-1 block text-[0.62rem] font-semibold tracking-[0.28em] text-slate-400 uppercase">
            Concursos
          </span>
        </span>
      )}
    </span>
  )
}
