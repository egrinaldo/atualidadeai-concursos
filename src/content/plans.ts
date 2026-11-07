/**
 * PLANO DE ASSINATURA
 * ---------------------------------------------------------------------
 * Oferta definida pelo responsável: plano único, mensal, R$ 10,00.
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
  priceCents: 1000,
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

/** Ex.: "R$ 10,00/mês" */
export function planPriceLabel(p: Plan = plan): string {
  return `${formatBRL(p.priceCents)}${p.priceSuffix}`
}
