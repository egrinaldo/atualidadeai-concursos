import { Container, Icon, Reveal, SectionHeading } from '@/components/ui'
import { problems } from '@/content/landing'

export function Problems() {
  return (
    <section className="py-20 sm:py-28" aria-labelledby="problemas-title">
      <Container className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <SectionHeading
          id="problemas-title"
          eyebrow={problems.eyebrow}
          title={problems.title}
          highlight={problems.titleHighlight}
          description={problems.description}
          className="lg:sticky lg:top-32 lg:self-start"
        />

        <ul className="grid gap-4 sm:grid-cols-2">
          {problems.items.map((item, i) => (
            <Reveal as="li" key={item.title} delay={i * 80}>
              <div className="group h-full rounded-2xl border border-white/8 bg-navy-900/60 p-6 transition-colors hover:border-danger-400/30">
                <span className="flex size-11 items-center justify-center rounded-xl bg-danger-400/10 text-danger-400 ring-1 ring-danger-400/20">
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
