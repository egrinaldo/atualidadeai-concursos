import { Icon } from '@/components/ui'
import { cn } from '@/utils/cn'

type PdfMockProps = {
  edition: string
  title: string
  className?: string
  /** Mostra os blocos de conteúdo detalhados (usado na demonstração). */
  detailed?: boolean
  /** Versão reduzida para miniaturas (sem etiquetas e blocos extras). */
  compact?: boolean
}

const levelTags = [
  { label: 'Regional', className: 'bg-signal-400/15 text-signal-300' },
  { label: 'Nacional', className: 'bg-brand-500/20 text-brand-200' },
  { label: 'Internacional', className: 'bg-white/10 text-slate-200' },
]

function Lines({ widths }: { widths: string[] }) {
  return (
    <div className="space-y-1.5" aria-hidden>
      {widths.map((w, i) => (
        <div key={i} className="h-1.5 rounded-full bg-slate-300/15" style={{ width: w }} />
      ))}
    </div>
  )
}

/**
 * Ilustração de uma página de PDF do AtualidadeAI.
 * Conteúdo propositalmente genérico e marcado como EXEMPLO.
 */
export function PdfMock({ edition, title, className, detailed = false, compact = false }: PdfMockProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-navy-800 to-navy-900 shadow-card',
        compact ? 'p-4' : 'p-5 sm:p-6',
        className,
      )}
      role="img"
      aria-label={`Ilustração de exemplo: ${title}`}
    >
      {/* Marca d'água de exemplo */}
      <span
        className={cn(
          'pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 font-display font-extrabold tracking-widest text-white/[0.04] select-none',
          compact ? 'text-3xl' : 'text-5xl sm:text-6xl',
        )}
      >
        EXEMPLO
      </span>

      <div className={cn('flex items-center justify-between gap-3 border-b border-white/10', compact ? 'pb-3' : 'pb-4')}>
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              'flex shrink-0 items-center justify-center rounded-lg bg-brand-500/20 text-brand-300',
              compact ? 'size-7' : 'size-8',
            )}
          >
            <Icon name="fileText" className={compact ? 'size-4' : 'size-4.5'} />
          </span>
          <div className="min-w-0">
            <p className={cn('font-display font-bold text-white', compact ? 'truncate text-xs' : 'text-sm')}>{title}</p>
            <p className="text-[0.7rem] text-slate-400">{edition}</p>
          </div>
        </div>
        {!compact && (
          <span className="rounded-md border border-warning-400/40 bg-warning-400/10 px-2 py-0.5 text-[0.62rem] font-bold tracking-wider text-warning-400 uppercase">
            Exemplo
          </span>
        )}
      </div>

      {compact ? (
        <div className="mt-4 space-y-4">
          <Lines widths={['100%', '86%', '60%']} />
          <Lines widths={['94%', '72%']} />
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {levelTags.map((t) => (
              <span key={t.label} className={cn('rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold', t.className)}>
                {t.label}
              </span>
            ))}
          </div>

          <div className="mt-5 space-y-5">
            <div>
              <p className="text-xs font-semibold text-slate-200">Tema fictício de exemplo</p>
              <div className="mt-2">
                <Lines widths={['100%', '92%', '64%']} />
              </div>
            </div>

            {detailed ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {['Contexto', 'Por que importa', 'Pontos de atenção', 'Fonte'].map((label) => (
                  <div key={label} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                    <p className="text-[0.68rem] font-bold tracking-wider text-brand-300 uppercase">{label}</p>
                    <div className="mt-2">
                      <Lines widths={['100%', '78%']} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-signal-400/20 bg-signal-400/[0.06] p-3">
                <p className="flex items-center gap-1.5 text-[0.68rem] font-bold tracking-wider text-signal-300 uppercase">
                  <Icon name="lightbulb" className="size-3.5" /> Por que importa para a prova
                </p>
                <div className="mt-2">
                  <Lines widths={['96%', '70%']} />
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-slate-200">Outro tema de exemplo</p>
              <div className="mt-2">
                <Lines widths={['100%', '84%']} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
