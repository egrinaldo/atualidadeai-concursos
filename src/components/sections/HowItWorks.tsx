import { Container, Icon, Reveal, SectionHeading } from '@/components/ui'
import { howItWorks } from '@/content/landing'

export function HowItWorks() {
  return (
    <section id="como-funciona" className="scroll-mt-20 py-20 sm:py-28" aria-labelledby="como-funciona-title">
      <Container>
        <SectionHeading
          id="como-funciona-title"
          eyebrow={howItWorks.eyebrow}
          title={howItWorks.title}
          highlight={howItWorks.titleHighlight}
        />

        <ol className="relative mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {/* Linha de conexão entre os passos (desktop) */}
          <div
            className="pointer-events-none absolute top-7 right-[12%] left-[12%] hidden border-t border-dashed border-brand-400/30 lg:block"
            aria-hidden
          />
          {howItWorks.steps.map((step, i) => (
            <Reveal as="li" key={step.title} delay={i * 110} className="relative">
              <div className="flex items-center gap-3 lg:flex-col lg:items-start">
                <span className="relative flex size-14 items-center justify-center rounded-2xl border border-brand-400/30 bg-navy-900 text-brand-300 shadow-glow">
                  <Icon name={step.icon} className="size-6" />
                  <span className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-signal-400 font-display text-xs font-bold text-navy-950">
                    {i + 1}
                  </span>
                </span>
                <h3 className="text-lg font-semibold lg:mt-4">{step.title}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{step.text}</p>
            </Reveal>
          ))}
        </ol>
      </Container>
    </section>
  )
}
