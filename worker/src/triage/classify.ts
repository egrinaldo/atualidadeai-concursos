import { BOOST, BRAZIL, CATEGORY_RULES, FOREIGN, NOISE, PARA_STATE, PENALTY, STATES, UF_PAREN } from './rules.ts'
import { detectLanguage, fold } from './text.ts'

export type Scope = 'internacional' | 'nacional' | 'estadual'
export type Relevance = 'muito_alta' | 'alta' | 'media' | 'baixa'

export type TriageInput = {
  title: string
  excerpt: string | null
  language: string
  scope: Scope | null
  state: string | null
  category: string | null
  source: { scope: Scope; state: string | null; default_category: string | null; reliability_level: number; is_primary: boolean; language: string }
}

export type TriageResult =
  | { discard: true; reason: string; language: string }
  | {
      discard: false
      language: string
      scope: Scope
      state: string | null
      category: string
      score: number
      relevance: Relevance
      reasons: string[]
    }

export const RELEVANCE_CUTS: [Relevance, number][] = [
  ['muito_alta', 70],
  ['alta', 50],
  ['media', 35],
  ['baixa', 0],
]
export const relevanceOf = (score: number): Relevance => RELEVANCE_CUTS.find(([, min]) => score >= min)![0]
export const RELEVANCE_RANK: Record<Relevance, number> = { baixa: 0, media: 1, alta: 2, muito_alta: 3 }

const BASE_SCORE = 30
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

/** Estados citados no texto (título pesa mais que o resumo). */
export function statesMentioned(original: string): Set<string> {
  const f = fold(original)
  const found = new Set<string>()
  for (const s of STATES) if (s.re.test(f)) found.add(s.uf)
  if (PARA_STATE.test(original)) found.add('PA')
  for (const m of original.matchAll(UF_PAREN)) found.add(m[1])
  return found
}

/** Alcance e UF: parte da fonte e só muda com sinal claro no título. */
export function resolveScope(input: TriageInput, category: string): { scope: Scope; state: string | null; reason?: string } {
  const src = input.source
  if (src.scope === 'estadual') return { scope: 'estadual', state: src.state }
  if (src.scope === 'internacional') return { scope: 'internacional', state: null }
  const t = fold(input.title)
  const states = statesMentioned(input.title)
  // Fato de um único estado vindo de fonte nacional → bloco do estado (exceto lei federal: vale para todos)
  const federalLaw = category === 'legislacao' || BOOST[0].re.test(t)
  if (states.size === 1 && !federalLaw) {
    const uf = [...states][0]
    return { scope: 'estadual', state: uf, reason: `fato localizado em ${uf}` }
  }
  if (FOREIGN.test(t) && !BRAZIL.test(t) && states.size === 0) return { scope: 'internacional', state: null, reason: 'fato no exterior' }
  return { scope: 'nacional', state: null }
}

/** Categoria pela maior soma de ocorrências (título vale 3, resumo 1); empate/zero → padrão da fonte. */
export function categorize(title: string, excerpt: string | null, fallback: string | null, scope: Scope): string {
  const t = fold(title)
  const e = fold(excerpt ?? '')
  let best = ''
  let bestScore = 0
  for (const c of CATEGORY_RULES) {
    const s = (t.match(c.re)?.length ?? 0) * 3 + (e.match(c.re)?.length ?? 0)
    if (s > bestScore) {
      best = c.code
      bestScore = s
    }
  }
  let code = best || fallback || (scope === 'estadual' ? 'acontecimentos_regionais' : 'sociedade')
  if (scope === 'internacional' && code === 'politica_nacional') code = 'politica_internacional'
  return code
}

/** Triagem determinística e explicável de uma notícia. */
export function triage(input: TriageInput): TriageResult {
  const text = `${input.title}. ${input.excerpt ?? ''}`
  const language = detectLanguage(text, input.source.language)
  const t = fold(input.title)

  for (const n of NOISE) if (n.re.test(t)) return { discard: true, reason: `baixa relevância: ${n.label}`, language }
  if (t.replace(/[^a-z]/g, '').length < 12) return { discard: true, reason: 'baixa relevância: título vazio ou curto demais', language }

  const reasons: string[] = []
  let score = BASE_SCORE
  const full = fold(text)

  for (const r of BOOST) {
    if (r.re.test(t)) {
      score += r.points
      reasons.push(`+${r.points} ${r.label}`)
    } else if (r.re.test(full)) {
      const p = Math.round(r.points / 2) // só no resumo: metade do peso
      score += p
      reasons.push(`+${p} ${r.label} (resumo)`)
    }
  }
  for (const r of PENALTY) {
    if (r.re.test(t)) {
      score += r.points
      reasons.push(`${r.points} ${r.label}`)
    }
  }

  const src = input.source
  if (src.is_primary) {
    score += 4
    reasons.push('+4 fonte oficial/primária')
  }
  if (src.reliability_level !== 3) {
    const p = (src.reliability_level - 3) * 2
    score += p
    reasons.push(`${p > 0 ? '+' : ''}${p} confiabilidade da fonte (${src.reliability_level}/5)`)
  }

  const preliminary = categorize(input.title, input.excerpt, input.category ?? src.default_category, src.scope)
  const geo = resolveScope(input, preliminary)
  const category = geo.scope === src.scope ? preliminary : categorize(input.title, input.excerpt, input.category ?? src.default_category, geo.scope)
  if (geo.reason) reasons.push(`alcance: ${geo.reason}`)

  score = clamp(score)
  return { discard: false, language, scope: geo.scope, state: geo.state, category, score, relevance: relevanceOf(score), reasons }
}
