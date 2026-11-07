import { Icon } from '@/components/ui'
import { dailyHeadlines, dailySample, monthlyContents, weeklySample, type SampleItem } from '@/content/samples'
import { cn } from '@/utils/cn'

/**
 * Ilustrações dos PDFs na página inicial, com TRECHOS REAIS das edições publicadas (content/samples.ts).
 * variant: "daily" (cartão do topo), "weekly" (demonstração com linha do tempo), "daily-mini" e "monthly-mini".
 */
type Variant = 'daily' | 'weekly' | 'daily-mini' | 'monthly-mini'

const levelClass: Record<SampleItem['level'], string> = {
  Estadual: 'bg-signal-400/15 text-signal-300',
  Nacional: 'bg-brand-500/20 text-brand-200',
  Internacional: 'bg-white/10 text-slate-200',
}

function Level({ level }: { level: SampleItem['level'] }) {
  return <span className={cn('rounded-full px-2 py-0.5 text-[0.62rem] font-semibold', levelClass[level])}>{level}</span>
}

function Header({ title, edition, compact, badge }: { title: string; edition: string; compact?: boolean; badge?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 border-b border-white/10', compact ? 'pb-3' : 'pb-4')}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={cn('flex shrink-0 items-center justify-center rounded-lg bg-brand-500/20 text-brand-300', compact ? 'size-7' : 'size-8')}>
          <Icon name="fileText" className={compact ? 'size-4' : 'size-4.5'} />
        </span>
        <div className="min-w-0">
          <p className={cn('font-display font-bold text-white', compact ? 'truncate text-xs' : 'text-sm')}>{title}</p>
          <p className="truncate text-[0.7rem] text-slate-400">{edition}</p>
        </div>
      </div>
      {badge && (
        <span className="shrink-0 rounded-md border border-success-400/40 bg-success-400/10 px-2 py-0.5 text-[0.6rem] font-bold tracking-wider text-success-400 uppercase">
          {badge}
        </span>
      )}
    </div>
  )
}

export function PdfMock({ variant, className }: { variant: Variant; className?: string }) {
  const frame = cn('relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-navy-800 to-navy-900 shadow-card', variant.endsWith('mini') ? 'p-4' : 'p-5 sm:p-6', className)

  if (variant === 'daily-mini')
    return (
      <div className={frame} role="figure" aria-label="Informativo diário: exemplos de títulos reais">
        <Header title="Diário" edition="Todo dia às 6h" compact />
        <ul className="mt-3 space-y-2">
          {dailyHeadlines.map((h) => (
            <li key={h} className="flex gap-1.5 text-[0.7rem] leading-snug text-slate-300">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-brand-300" aria-hidden />
              {h}
            </li>
          ))}
        </ul>
      </div>
    )

  if (variant === 'monthly-mini')
    return (
      <div className={frame} role="figure" aria-label="Revisão mensal: o que contém">
        <Header title="Mensal" edition="Todo dia 1º" compact />
        <ul className="mt-3 space-y-2">
          {monthlyContents.map((h) => (
            <li key={h} className="flex gap-1.5 text-[0.7rem] leading-snug text-slate-300">
              <Icon name="check" className="mt-0.5 size-3 shrink-0 text-signal-400" />
              {h}
            </li>
          ))}
        </ul>
      </div>
    )

  if (variant === 'weekly') {
    const w = weeklySample
    return (
      <div className={frame} role="figure" aria-label={`${w.title}: ${w.story.title}`}>
        <Header title={w.title} edition={w.edition} badge="Fatos reais" />
        <div className="mt-4 flex items-center gap-2">
          <Level level={w.story.level} />
          <span className="text-[0.65rem] text-slate-500">Acompanhado em 2 edições diárias</span>
        </div>
        <p className="mt-2 text-sm font-semibold text-white">{w.story.title}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{w.story.text}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3 sm:col-span-2">
            <p className="text-[0.66rem] font-bold tracking-wider text-brand-300 uppercase">Linha do tempo</p>
            <ol className="mt-2 space-y-1.5 border-l-2 border-brand-500/40 pl-3">
              {w.timeline.map((t) => (
                <li key={t.date} className="text-[0.72rem] leading-snug text-slate-300">
                  <b className="mr-1.5 font-display text-brand-200">{t.date}</b>
                  {t.fact}
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
            <p className="text-[0.66rem] font-bold tracking-wider text-brand-300 uppercase">Para memorizar</p>
            <ul className="mt-1.5 space-y-1 text-[0.7rem] leading-snug text-slate-300">
              {w.memorize.map((m) => (
                <li key={m}>• {m}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
            <p className="text-[0.66rem] font-bold tracking-wider text-brand-300 uppercase">Fontes</p>
            <p className="mt-1.5 text-[0.7rem] leading-snug text-slate-300">{w.sources}</p>
          </div>
        </div>
      </div>
    )
  }

  const d = dailySample
  return (
    <div className={frame} role="figure" aria-label={`${d.title}, ${d.edition}`}>
      <Header title={d.title} edition={d.edition} badge="Trecho real" />
      <div className="mt-4 space-y-4">
        <div>
          <Level level={d.lead.level} />
          <p className="mt-2 text-sm font-semibold text-white">{d.lead.title}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{d.lead.text}</p>
        </div>
        <div className="rounded-xl border border-signal-400/20 bg-signal-400/[0.06] p-3">
          <p className="flex items-center gap-1.5 text-[0.66rem] font-bold tracking-wider text-signal-300 uppercase">
            <Icon name="lightbulb" className="size-3.5" /> Por que importa para a prova
          </p>
          <p className="mt-1.5 text-[0.72rem] leading-relaxed text-slate-300">{d.whyItMatters}</p>
        </div>
        <ul className="space-y-2.5">
          {d.more.map((m) => (
            <li key={m.title} className="flex items-start gap-2">
              <Level level={m.level} />
              <span className="text-xs leading-snug font-medium text-slate-200">{m.title}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
