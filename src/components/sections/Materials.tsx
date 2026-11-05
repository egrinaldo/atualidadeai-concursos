import { Container, Icon, Reveal, SectionHeading } from '@/components/ui'
import { materials } from '@/content/landing'

export function Materials() {
  return (
    <section id="materiais" className="scroll-mt-20 py-20 sm:py-28" aria-labelledby="materiais-title">
      <Container>
        <SectionHeading
          id="materiais-title"
          eyebrow={materials.eyebrow}
          title={materials.title}
          highlight={materials.titleHighlight}
        />

        <ul className="mt-14 grid gap-5 md:grid-cols-3">
          {materials.items.map((item, i) => (
            <Reveal as="li" key={item.cadence} delay={i * 100}>
              <article className="group relative h-full overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-b from-navy-800/70 to-navy-900/70 p-7">
                <span className="absolute top-6 right-6 rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
                  {item.cadence}
                </span>
                <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-glow">
                  <Icon name={item.icon} className="size-6" />
                </span>
                <h3 className="mt-6 text-xl font-bold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.text}</p>
                <ul className="mt-6 space-y-2.5">
                  {item.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2.5 text-sm text-slate-300">
                      <Icon name="check" className="mt-0.5 size-4 text-signal-400" />
                      {b}
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
