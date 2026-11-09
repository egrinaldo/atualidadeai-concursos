/**
 * Cota de IA proporcional ao número de estados com edição (09/11/2026: com 3 UFs a cota fixa de 120 chamadas/dia
 * esgotou a capacidade e as diárias saíram com 2–4 assuntos). Cada assunto custa ~4–5 chamadas (análise,
 * correção de formato, auditoria e correção da auditoria).
 *
 *   cota diária   = ai.daily_call_budget (base, 1 UF) + ai.daily_call_budget_per_state × (UFs − 1), até ai.daily_call_budget_max
 *   por rodada    = ai.max_calls_per_run + ai.max_calls_per_run_per_state × (UFs − 1), até ai.max_calls_per_run_max
 */
export const BUDGET_DEFAULTS = { base: 120, perState: 50, max: 600, runBase: 6, runPerState: 3, runMax: 16 }

export function scaledBudget(get: <T>(k: string, d: T) => T, states: number): { daily: number; perRun: number } {
  const extra = Math.max(0, states - 1)
  const daily = Math.min(
    Number(get('ai.daily_call_budget_max', BUDGET_DEFAULTS.max)),
    Number(get('ai.daily_call_budget', BUDGET_DEFAULTS.base)) + Number(get('ai.daily_call_budget_per_state', BUDGET_DEFAULTS.perState)) * extra,
  )
  const perRun = Math.min(
    Number(get('ai.max_calls_per_run_max', BUDGET_DEFAULTS.runMax)),
    Number(get('ai.max_calls_per_run', BUDGET_DEFAULTS.runBase)) + Number(get('ai.max_calls_per_run_per_state', BUDGET_DEFAULTS.runPerState)) * extra,
  )
  return { daily, perRun }
}
