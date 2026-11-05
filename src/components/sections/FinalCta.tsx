import { Button, Container, Icon, Reveal } from '@/components/ui'
import { finalCta } from '@/content/landing'

export function FinalCta() {
  return (
    <section className="pb-20 sm:pb-28" aria-labelledby="cta-final-title">
      <Container>
        <Reveal className="relative overflow-hidden rounded-3xl border border-brand-400/30 bg-gradient-to-br from-brand-600 via-brand-700 to-navy-800 px-6 py-14 text-center sm:px-12 sm:py-16">
          <div className="bg-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden />
          <div className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-signal-400/25 blur-3xl" aria-hidden />
          <div className="relative">
            <h2 id="cta-final-title" className="text-3xl leading-tight font-extrabold sm:text-4xl">
              {finalCta.title} <span className="text-signal-300">{finalCta.titleHighlight}</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-brand-200">{finalCta.text}</p>
            <Button href={finalCta.cta.href} variant="light" size="lg" className="mt-8">
              {finalCta.cta.label}
              <Icon name="arrowRight" className="size-4.5" />
            </Button>
          </div>
        </Reveal>
      </Container>
    </section>
  )
}
