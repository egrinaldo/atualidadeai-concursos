import { Button, Container, Icon } from '@/components/ui'
import { hero, highlights } from '@/content/landing'
import { offerLabel, promoActive } from '@/content/plans'
import { PdfMock } from './PdfMock'

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-16 sm:pt-36 lg:pt-44 lg:pb-24" aria-labelledby="hero-title">
      {/* Ambientação: grade técnica + brilho, inspirada nas referências */}
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
      <div className="bg-radial-glow pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute top-40 -right-40 size-[32rem] rounded-full bg-brand-600/20 blur-3xl" />

      <Container className="relative grid items-center gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
        <div className="animate-fade-up">
          <p className="inline-flex items-center gap-2 rounded-full border border-signal-400/25 bg-signal-400/[0.07] px-3.5 py-1.5 text-xs font-semibold text-signal-300">
            <span className="size-1.5 animate-pulse-dot rounded-full bg-signal-400" aria-hidden />
            {hero.eyebrow}
          </p>

          <h1 id="hero-title" className="mt-6 text-[2.35rem] leading-[1.08] font-extrabold sm:text-5xl lg:text-[3.6rem]">
            {hero.titleStart} <span className="text-signal-400">{hero.titleHighlight}</span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">{hero.description}</p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button href={hero.primaryCta.href} size="lg">
              {hero.primaryCta.label}
              <Icon name="arrowRight" className="size-4.5" />
            </Button>
            <Button href={hero.secondaryCta.href} variant="secondary" size="lg">
              {hero.secondaryCta.label}
            </Button>
          </div>

          <p className="mt-5 text-sm text-slate-400">
            {promoActive() ? 'Black Friday: ' : 'Assinatura de '}
            <strong className="font-semibold text-white">{offerLabel()}</strong>
            <span className="text-slate-500"> · pagamento via Mercado Pago</span>
          </p>
        </div>

        {/* Visual ilustrativo do PDF */}
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div className="absolute inset-x-6 -top-4 h-full rotate-3 rounded-2xl border border-white/5 bg-navy-800/60" aria-hidden />
          <div className="absolute inset-x-3 -top-2 h-full rotate-[1.5deg] rounded-2xl border border-white/5 bg-navy-800/80" aria-hidden />
          <PdfMock variant="daily" className="relative" />

          <div className="absolute -bottom-5 -left-2 hidden items-center gap-2 rounded-xl border border-white/10 bg-navy-900/95 px-3.5 py-2.5 text-xs font-semibold text-slate-200 shadow-card backdrop-blur sm:flex">
            <Icon name="mapPin" className="size-4 text-signal-400" />
            Inclui as atualidades do seu estado
          </div>
        </div>
      </Container>

      {/* Faixa de destaques do produto */}
      <Container className="relative mt-20 lg:mt-24">
        <ul className="grid gap-px overflow-hidden rounded-2xl border border-white/8 bg-white/8 sm:grid-cols-3">
          {highlights.map((item) => (
            <li key={item.label} className="flex items-center gap-4 bg-navy-950/90 p-5 sm:p-6">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/30 to-brand-500/5 text-brand-300 ring-1 ring-brand-400/25">
                <Icon name={item.icon} className="size-6" />
              </span>
              <div>
                <p className="font-display text-xl font-bold text-white">{item.value}</p>
                <p className="text-sm text-slate-400">{item.label}</p>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  )
}
