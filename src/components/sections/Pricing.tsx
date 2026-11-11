import { Badge, Button, Container, Icon, Reveal, SectionHeading } from '@/components/ui'
import { formatBRL, plan, PLAN_PRICES_ARE_EXAMPLES, planFeatures, promo, promoActive } from '@/content/plans'

/** Seção de preço — plano único de assinatura mensal. */
export function Pricing() {
  // Black Friday (até 29/11/2026): preço de entrada no 1º mês; depois volta sozinho ao preço normal
  const emPromo = promoActive()
  const destaque = emPromo ? promo.introCents : plan.priceCents
  const [reais, centavos] = formatBRL(destaque).replace('R$', '').trim().split(',')

  return (
    <section id="planos" className="relative scroll-mt-20 py-20 sm:py-28" aria-labelledby="planos-title">
      <div className="glow-line absolute inset-x-0 top-0" aria-hidden />
      <div className="bg-radial-glow pointer-events-none absolute inset-0 opacity-70" aria-hidden />

      <Container className="relative">
        <SectionHeading
          id="planos-title"
          eyebrow="Assinatura"
          title="Tudo incluso, em um"
          highlight="único plano."
          description="Sem pacotes nem letras miúdas: uma assinatura mensal com acesso a todos os materiais."
          align="center"
        />

        {PLAN_PRICES_ARE_EXAMPLES && (
          <Reveal className="mt-6 flex justify-center">
            <Badge tone="warning">Valor de exemplo</Badge>
          </Reveal>
        )}

        <Reveal className="mx-auto mt-12 max-w-4xl">
          <article className="relative grid overflow-hidden rounded-3xl border border-brand-400/50 bg-gradient-to-br from-brand-600/25 via-navy-900 to-navy-900 shadow-glow md:grid-cols-[1fr_1.1fr]">
            <div className="bg-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_right,black,transparent_60%)]" aria-hidden />

            {/* Preço e ação */}
            <div className="relative flex flex-col justify-center border-b border-white/8 p-8 sm:p-10 md:border-r md:border-b-0">
              {emPromo && (
                <p className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-signal-400 px-3 py-1 text-xs font-extrabold tracking-[0.18em] text-navy-950 uppercase">
                  {promo.label}
                </p>
              )}
              <h3 className="text-xl font-bold">{plan.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{plan.description}</p>

              {emPromo && (
                <p className="mt-8 text-base text-slate-400">
                  de <span className="line-through">{formatBRL(plan.priceCents)}</span> por
                </p>
              )}
              <p
                className={emPromo ? 'mt-1 flex items-start text-white' : 'mt-8 flex items-start text-white'}
                aria-label={emPromo ? `${formatBRL(promo.introCents)} no primeiro mês` : `${formatBRL(plan.priceCents)} por mês`}
              >
                <span className="mt-2 mr-1.5 text-lg font-semibold text-slate-300">R$</span>
                <span className="font-display text-7xl leading-none font-extrabold tracking-tight">{reais}</span>
                <span className="mt-2 font-display text-2xl font-bold">,{centavos}</span>
                <span className="mt-auto mb-2 ml-2 text-base text-slate-400">{emPromo ? 'no 1º mês' : plan.priceSuffix}</span>
              </p>
              {emPromo && (
                <p className="mt-3 text-sm leading-relaxed text-slate-300">
                  Depois, {formatBRL(plan.priceCents)}
                  {plan.priceSuffix}. Válido para assinaturas feitas até {promo.lastDayLabel}. Cancele quando quiser, sem multa.
                </p>
              )}

              <Button href={`/cadastro?plano=${plan.code}`} size="lg" className="mt-8 w-full">
                Assinar agora
                <Icon name="arrowRight" className="size-4.5" />
              </Button>
              <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-slate-500">
                <Icon name="shield" className="size-4" />
                Pagamento seguro via Mercado Pago
              </p>
            </div>

            {/* O que está incluso */}
            <div className="relative p-8 sm:p-10">
              <p className="text-xs font-bold tracking-[0.2em] text-brand-300 uppercase">O que está incluso</p>
              <ul className="mt-6 space-y-4">
                {planFeatures.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm text-slate-200 sm:text-base">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-signal-400/15 text-signal-400">
                      <Icon name="check" className="size-3.5" />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </article>
        </Reveal>

        <p className="mt-8 text-center text-xs text-slate-500">
          Nenhum dado de cartão é armazenado pelo AtualidadeAI.
        </p>
      </Container>
    </section>
  )
}
