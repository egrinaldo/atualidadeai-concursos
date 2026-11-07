import { site } from '@/config/site'
import { Container, Icon, Reveal, SectionHeading } from '@/components/ui'
import { faq } from '@/content/landing'

/**
 * Perguntas frequentes em acordeão nativo (<details>), acessível por teclado
 * e leitores de tela sem JavaScript adicional.
 */
export function Faq() {
  return (
    <section id="duvidas" className="scroll-mt-20 py-20 sm:py-28" aria-labelledby="duvidas-title">
      <Container className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <SectionHeading
          id="duvidas-title"
          eyebrow={faq.eyebrow}
          title={faq.title}
          highlight={faq.titleHighlight}
          description={`Não encontrou sua dúvida? Escreva para ${site.contactEmail}.`}
          className="lg:sticky lg:top-32 lg:self-start"
        />

        <Reveal className="divide-y divide-white/8 rounded-3xl border border-white/8 bg-navy-900/60">
          {faq.items.map((item, i) => (
            <details key={item.question} className="group px-6 sm:px-7" open={i === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left font-semibold text-white marker:hidden [&::-webkit-details-marker]:hidden">
                {item.question}
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/10 text-brand-300 transition-transform duration-300 group-open:rotate-180">
                  <Icon name="chevronDown" className="size-4" />
                </span>
              </summary>
              <p className="pb-6 text-sm leading-relaxed text-slate-400">{item.answer}</p>
            </details>
          ))}
        </Reveal>
      </Container>
    </section>
  )
}
