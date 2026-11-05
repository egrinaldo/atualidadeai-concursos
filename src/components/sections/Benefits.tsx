import { Container, Icon, Reveal, SectionHeading } from '@/components/ui'
import { benefits } from '@/content/landing'

export function Benefits() {
  return (
    <section className="relative py-20 sm:py-28" aria-labelledby="beneficios-title">
      <div className="glow-line absolute inset-x-0 top-0" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-navy-900/80 to-transparent" aria-hidden />

      <Container className="relative">
        <SectionHeading
          id="beneficios-title"
          eyebrow={benefits.eyebrow}
          title={benefits.title}
          highlight={benefits.titleHighlight}
          align="center"
        />

        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.items.map((item, i) => (
            <Reveal as="li" key={item.title} delay={(i % 3) * 90}>
              <div className="h-full rounded-2xl border border-white/8 bg-navy-900/70 p-6 shadow-card transition duration-300 hover:-translate-y-1 hover:border-brand-400/40">
                <span className="flex size-11 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300 ring-1 ring-brand-400/25">
                  <Icon name={item.icon} />
                </span>
                <h3 className="mt-5 text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.text}</p>
              </div>
            </Reveal>
          ))}
        </ul>
      </Container>
    </section>
  )
}
