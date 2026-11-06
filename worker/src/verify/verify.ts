import { RELEVANCE_RANK, type Relevance } from '../triage/classify.ts'
import { fold } from '../triage/text.ts'
import { attributions, compareClaims, DENIAL, extractClaims, type Claim } from './claims.ts'

export type VerificationStatus = 'corroborada' | 'parcialmente_corroborada' | 'nao_confirmada' | 'fontes_divergentes' | 'contradita' | 'insuficiente'
export type Confidence = 'alta' | 'media' | 'baixa'

export const VERIFIER = { provider: 'regras', model: 'verificacao-v1' }

export type VerifyMember = {
  id: string
  title: string
  excerpt: string | null
  content: string | null
  url: string
  language: string
  source_name: string
  group_key: string // grupo editorial (fontes do mesmo grupo não são independentes)
  is_primary: boolean
  reliability_level: number
}

export type Verification = {
  verification_status: VerificationStatus
  confidence_level: Confidence
  claims: Claim[]
  evidence: { news_id: string; source: string; url: string; fonte_oficial: boolean; trecho: string }[]
  supporting_news_ids: string[]
  contradictory_news_ids: string[]
  independent_sources: number
  analysis: string
  needs_human_review: boolean
}

const MIN_TEXT = 60 // abaixo disso (só título) não há base para verificar

/**
 * Verificação determinística de um assunto, só com o que está no banco:
 * fontes independentes (grupos editoriais), fonte oficial, números coincidentes/divergentes,
 * desmentidos explícitos e atribuições. Casos duvidosos vão para revisão humana.
 */
export function verifyCluster(members: VerifyMember[], relevance: Relevance | null, opts = { singleSourceMinReliability: 4 }): Verification {
  const groups = new Map<string, VerifyMember[]>()
  for (const m of members) groups.set(m.group_key, [...(groups.get(m.group_key) ?? []), m])
  const independent = groups.size
  const official = members.filter((m) => m.is_primary)
  const hasText = members.some((m) => (m.excerpt ?? m.content ?? '').length >= MIN_TEXT)
  const bestReliability = Math.max(...members.map((m) => m.reliability_level))
  const groupOf = (id: string) => members.find((m) => m.id === id)!.group_key

  const claims = members.flatMap((m) => {
    // Divergência só entre números dos TÍTULOS (o fato principal); resumo e corpo trazem outras medidas
    // (receita × lucro × dívida) e servem só para confirmar coincidências
    const lead = extractClaims(m.id, m.title, m.language, true)
    const seen = new Set(lead.map((c) => `${c.kind}|${c.unit}|${c.value}`))
    const rest = extractClaims(m.id, `${m.excerpt ?? ''}. ${(m.content ?? '').slice(0, 3000)}`, m.language, false).filter((c) => !seen.has(`${c.kind}|${c.unit}|${c.value}`))
    return [...lead, ...rest]
  })
  const comparisons = compareClaims(claims, groupOf)
  const agree = comparisons.filter((c) => c.relation === 'coincide')
  const diverge = comparisons.filter((c) => c.relation === 'diverge')
  const denials = members.filter((m) => DENIAL.test(fold(m.title)))
  const attributed = [...new Set(members.flatMap((m) => attributions(`${m.excerpt ?? ''} ${(m.content ?? '').slice(0, 3000)}`)))]

  let status: VerificationStatus
  let confidence: Confidence
  const notes: string[] = []
  const contradictory = new Set<string>()

  // Desmentido só conta se vier de um grupo editorial diferente das matérias que afirmam o fato
  const assertingGroups = new Set(members.filter((m) => !denials.includes(m)).map((m) => m.group_key))
  const crossDenials = denials.filter((d) => [...assertingGroups].some((g) => g !== d.group_key))
  if (crossDenials.length) {
    status = 'contradita'
    confidence = 'baixa'
    for (const d of crossDenials) contradictory.add(d.id)
    notes.push(`Há desmentido explícito em ${[...new Set(crossDenials.map((d) => d.source_name))].join(', ')}.`)
  } else if (diverge.length) {
    status = 'fontes_divergentes'
    confidence = 'baixa'
    for (const d of diverge) {
      contradictory.add(d.a.news_id)
      contradictory.add(d.b.news_id)
    }
    notes.push(`Números divergentes entre fontes: ${diverge.slice(0, 3).map((d) => `"${d.a.text}" × "${d.b.text}"`).join('; ')}.`)
  } else if (independent >= 2 && official.length) {
    status = 'corroborada'
    confidence = 'alta'
  } else if (independent >= 3) {
    status = 'corroborada'
    confidence = 'media'
  } else if (official.length) {
    status = 'parcialmente_corroborada'
    confidence = hasText ? 'media' : 'baixa'
    notes.push('Publicada pela própria fonte oficial; ainda sem segunda fonte independente.')
  } else if (independent >= 2) {
    status = 'parcialmente_corroborada'
    confidence = 'media'
    notes.push('Duas fontes independentes, nenhuma oficial.')
  } else if (!hasText) {
    status = 'insuficiente'
    confidence = 'baixa'
    notes.push('Fonte única e sem texto suficiente para verificar (apenas título).')
  } else {
    status = 'nao_confirmada'
    confidence = 'baixa'
    notes.push('Fonte única, não oficial.')
    if (bestReliability >= opts.singleSourceMinReliability) notes.push(`Confiabilidade da fonte: ${bestReliability}/5 (pode entrar na edição sinalizada como fonte única).`)
  }

  const sourcesLine = [...groups.values()].map((g) => g[0].source_name + (g.some((m) => m.is_primary) ? ' (oficial)' : '')).join('; ')
  const summary = [`${independent} fonte(s) independente(s): ${sourcesLine}.`]
  if (agree.length) summary.push(`Números coincidem entre fontes: ${[...new Set(agree.map((c) => c.a.text))].slice(0, 3).join(', ')}.`)
  if (attributed.length) summary.push(`Informação atribuída a: ${attributed.join(', ')}.`)

  const high = relevance ? RELEVANCE_RANK[relevance] >= RELEVANCE_RANK.alta : false
  // Fonte única com confiabilidade abaixo do mínimo configurado só entra na edição após revisão humana
  const weakSingle = (status === 'nao_confirmada' || status === 'insuficiente') && (status === 'insuficiente' || bestReliability < opts.singleSourceMinReliability)
  const needsReview = status === 'contradita' || status === 'fontes_divergentes' || (high && weakSingle)

  const ordered = [...members].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || b.reliability_level - a.reliability_level)
  return {
    verification_status: status,
    confidence_level: confidence,
    claims: claims.slice(0, 30),
    evidence: ordered.slice(0, 10).map((m) => ({
      news_id: m.id,
      source: m.source_name,
      url: m.url,
      fonte_oficial: m.is_primary,
      trecho: (m.excerpt ?? m.content ?? m.title).slice(0, 300),
    })),
    supporting_news_ids: members.filter((m) => !contradictory.has(m.id)).map((m) => m.id),
    contradictory_news_ids: [...contradictory],
    independent_sources: independent,
    analysis: [...summary, ...notes].join(' ').slice(0, 5000),
    needs_human_review: needsReview,
  }
}

/** Status que podem entrar na edição sem revisão humana (política padrão; ajustável em app_settings). */
export const DEFAULT_EDITION_STATUSES: VerificationStatus[] = ['corroborada', 'parcialmente_corroborada', 'nao_confirmada']
