import { Container, Icon, Reveal, SectionHeading } from '@/components/ui'
import { coverage } from '@/content/landing'
import { cn } from '@/utils/cn'

const accents = [
  'from-signal-400/20 text-signal-300 ring-signal-400/30',
  'from-brand-500/25 text-brand-300 ring-brand-400/30',
  'from-white/15 text-slate-200 ring-white/20',
]

export function Coverage() {
  return (
    <section id="cobertura" className="relative scroll-mt-20 py-20 sm:py-28" aria-labelledby="cobertura-title">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:linear-gradient(to_bottom,transparent,black_30%,black_70%,transparent)]" />
      <Container className="relative">
        <SectionHeading
          id="cobertura-title"
          eyebrow={coverage.eyebrow}
          title={coverage.title}
          highlight={coverage.titleHighlight}
          align="center"
        />

        <ul className="mt-14 grid gap-5 lg:grid-cols-3">
          {coverage.levels.map((level, i) => (
            <Reveal as="li" key={level.tag} delay={i * 100}>
              <article className="flex h-full flex-col rounded-3xl border border-white/8 bg-navy-900/80 p-7 shadow-card backdrop-blur">
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      'flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br to-transparent ring-1',
                      accents[i],
                    )}
                  >
                    <Icon name={level.icon} className="size-6" />
                  </span>
                  <span className="text-xs font-bold tracking-[0.2em] text-slate-500 uppercase">{level.tag}</span>
                </div>
                <h3 className="mt-6 text-xl font-bold">{level.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{level.text}</p>
                <ul className="mt-6 space-y-2.5 border-t border-white/8 pt-5" aria-label={`Temas acompanhados — ${level.tag}`}>
                  {level.topics.map((topic) => (
                    <li key={topic} className="flex items-center gap-2.5 text-sm text-slate-300">
                      <Icon name="check" className="size-4 text-signal-400" />
                      {topic}
                    </li>
                  ))}
                </ul>
              </article>
            </Reveal>
          ))}
        </ul>
      </Container>
    </section>
  )
}
