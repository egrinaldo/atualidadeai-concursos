import { formatBRL, plan, promo, promoActive } from '@/content/plans'

/** Faixa temporária de Black Friday no topo do site. Some sozinha depois de 29/11/2026 (promoActive). */
export function PromoBar() {
  if (!promoActive()) return null
  const dias = Math.max(0, Math.ceil((new Date(promo.endsAt).getTime() - Date.now()) / 86_400_000))
  const prazo = dias <= 1 ? 'termina hoje' : `termina em ${dias} dias`
  return (
    <a
      href="/#planos"
      className="block bg-signal-400 px-4 py-2 text-center text-xs font-bold text-navy-950 transition-colors hover:bg-signal-300 sm:text-sm"
    >
      <span className="tracking-[0.15em] uppercase">{promo.label}</span>
      <span className="mx-2" aria-hidden>
        ·
      </span>
      1º mês por {formatBRL(promo.introCents)}
      <span className="hidden sm:inline"> (depois {formatBRL(plan.priceCents)}/mês)</span>
      <span className="mx-2" aria-hidden>
        ·
      </span>
      {prazo} <span className="underline underline-offset-2">Garantir →</span>
    </a>
  )
}
