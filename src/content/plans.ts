/**
 * PLANO DE ASSINATURA
 * ---------------------------------------------------------------------
 * Oferta definida pelo responsável: plano único, mensal, R$ 29,90 (preço de produção desde 11/11/2026; antes, na fase
 * de testes, R$ 10,00 e R$ 9,99). Black Friday: R$ 9,90/mês garantido para quem assinar até 29/11/2026 (ver `promo`).
 *
 * Na Subetapa 5 o plano passa a ser lido da tabela `plans` do Supabase
 * (preço configurável pelo banco) e este arquivo vira apenas o valor
 * padrão exibido caso o banco esteja indisponível.
 *
 * Valores em centavos para evitar erros de arredondamento.
 */
export type BillingPeriod = 'monthly'

export type Plan = {
  /** Igual a plans.code no banco (usado na URL de contratação). */
  code: string
  id: BillingPeriod
  name: string
  description: string
  priceCents: number
  months: number
  /** Sufixo curto exibido após o preço (ex.: "/mês"). */
  priceSuffix: string
}

/** Mude para `true` se voltar a exibir valores provisórios. */
export const PLAN_PRICES_ARE_EXAMPLES = false

export const plan: Plan = {
  code: 'mensal',
  id: 'monthly',
  name: 'Assinatura mensal',
  description: 'Acesso completo a todos os materiais, com renovação automática todo mês.',
  priceCents: 2990,
  months: 1,
  priceSuffix: '/mês',
}

/** Recursos incluídos na assinatura. */
export const planFeatures = [
  'PDF diário de atualidades',
  'Compilado semanal em PDF',
  'Compilado mensal em PDF',
  'Atualidades do seu estado',
  'Destaques nacionais e internacionais',
  'Conteúdo com foco em concursos públicos',
]

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Ex.: "R$ 29,90/mês" */
export function planPriceLabel(p: Plan = plan): string {
  return `${formatBRL(p.priceCents)}${p.priceSuffix}`
}

/**
 * PROMOÇÃO TEMPORÁRIA — Black Friday (decisão do responsável, 11/11/2026)
 * Quem assinar até 29/11/2026 23:59 (Brasília) paga R$ 9,90/mês em todas as renovações (preço garantido enquanto mantiver
 * a assinatura). Novas assinaturas depois do prazo: R$ 29,90/mês. Decisão do responsável (11/11/2026): exibir só R$ 9,90,
 * sem preço "de".
 * O tema e os textos da promoção ligam e desligam SOZINHOS pela data (`promoActive`): a partir de 30/11/2026 00:00
 * o site volta ao visual e ao texto padrão, sem nova publicação. Mesmo valor/data na tabela `plans` (migração 29),
 * que é quem define o que o Mercado Pago cobra.
 */
export const promo = {
  label: 'Black Friday',
  introCents: 990,
  /** Fim exclusivo: 30/11/2026 00:00 em Brasília. */
  endsAt: '2026-11-30T03:00:00Z',
  /** Último dia, para os textos. */
  lastDayLabel: '29/11',
}

export function promoActive(now: Date = new Date()): boolean {
  return now < new Date(promo.endsAt)
}

/** Ex.: "R$ 9,90/mês (preço garantido)" na promoção, senão "R$ 29,90/mês". */
export function offerLabel(now: Date = new Date()): string {
  return promoActive(now) ? `${formatBRL(promo.introCents)}${plan.priceSuffix} (preço garantido)` : planPriceLabel()
}
