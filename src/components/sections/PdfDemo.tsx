import { Badge, Container, Reveal, SectionHeading } from '@/components/ui'
import { pdfDemo } from '@/content/landing'
import { PdfMock } from './PdfMock'

export function PdfDemo() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-28" aria-labelledby="demo-title">
      <div className="glow-line absolute inset-x-0 top-0" aria-hidden />
      <div className="pointer-events-none absolute -left-40 top-1/3 size-[30rem] rounded-full bg-brand-600/15 blur-3xl" aria-hidden />

      <Container className="relative grid grid-cols-1 items-center gap-14 lg:grid-cols-2">
        {/* min-w-0: impede que o conteúdo force a coluna além da largura da tela */}
        <div className="min-w-0">
          <SectionHeading
            id="demo-title"
            eyebrow={pdfDemo.eyebrow}
            title={pdfDemo.title}
            highlight={pdfDemo.titleHighlight}
            description={pdfDemo.description}
          />
          <Reveal>
            <Badge tone="success" className="mt-6">
              Trechos reais das edições publicadas
            </Badge>
          </Reveal>
          <ol className="mt-8 space-y-4">
            {pdfDemo.sections.map((s, i) => (
              <Reveal as="li" key={s.label} delay={i * 80} className="flex gap-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-brand-400/30 font-display text-sm font-bold text-brand-300">
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold text-white">{s.label}</p>
                  <p className="text-sm text-slate-400">{s.text}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>

        <Reveal className="relative mx-auto w-full max-w-lg min-w-0">
          <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-brand-500/20 via-transparent to-signal-400/10 blur-xl" aria-hidden />
          <div className="relative space-y-4">
            <PdfMock variant="weekly" />
            <div className="grid grid-cols-2 gap-4 [&>*]:min-w-0">
              <PdfMock variant="daily-mini" />
              <PdfMock variant="monthly-mini" />
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  )
}
