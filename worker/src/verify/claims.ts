import { fold, stem } from '../triage/text.ts'

/** Afirmação verificável extraída do texto (números com unidade). Nada é inventado: tudo vem do texto da notícia. */
export type Claim = {
  news_id: string
  kind: 'percentual' | 'valor_monetario' | 'quantidade'
  value: number // valor normalizado (percentual absoluto; dinheiro em unidades; quantidade em unidades)
  unit: string // '%', 'BRL', 'EUR', 'USD' ou o substantivo contado ("vagas", "mortes"…)
  text: string // trecho literal
  context: string[] // radicais das palavras ao redor (para saber se dois números falam da mesma coisa)
  lead: boolean // veio do título/resumo (fato principal) e não do corpo do texto
}

const SCALE: Record<string, number> = { mil: 1e3, milhao: 1e6, milhoes: 1e6, bilhao: 1e9, bilhoes: 1e9, trilhao: 1e12, trilhoes: 1e12, million: 1e6, billion: 1e9, trillion: 1e12, thousand: 1e3 }
const COUNTED = 'vagas|pessoas|mortes|mortos|vitimas|doses|casas|domicilios|prisoes|presos|servidores|participantes|paises|estados|municipios|empregos|familias|alunos|estudantes|candidatos|inscritos|leitos|hectares|toneladas|deaths|people|countries|jobs'

/** "27.279" → 27279; "13,75" → 13.75; "1.8" (inglês) → 1.8; "1,000" (inglês) → 1000. */
export function parseNumber(raw: string, english = false): number {
  let s = raw.trim()
  if (english) s = s.replace(/,(?=\d{3}\b)/g, '')
  else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(',', '.')
  return Number(s)
}

function contextAround(f: string, index: number, length: number): string[] {
  const before = f.slice(Math.max(0, index - 60), index).match(/[a-z]{4,}/g) ?? []
  const after = f.slice(index + length, index + length + 40).match(/[a-z]{4,}/g) ?? []
  return [...before.slice(-4), ...after.slice(0, 2)].map(stem)
}

/** Extrai percentuais, valores em dinheiro e quantidades contadas. */
export function extractClaims(newsId: string, text: string, language = 'pt', lead = true): Claim[] {
  const f = fold(text)
  const en = language === 'en'
  const claims: Claim[] = []
  const seen = new Set<string>()
  const push = (c: Claim) => {
    const k = `${c.kind}|${c.unit}|${c.value}`
    if (Number.isFinite(c.value) && !seen.has(k)) {
      seen.add(k)
      claims.push(c)
    }
  }
  for (const m of f.matchAll(/(-?\d+(?:[.,]\d+)*)\s?%/g))
    push({ news_id: newsId, kind: 'percentual', value: Math.abs(parseNumber(m[1], en)), unit: '%', text: m[0], context: contextAround(f, m.index!, m[0].length), lead })
  for (const m of f.matchAll(/(r\$|€|us\$|\$)\s?(\d+(?:[.,]\d+)*)(?:\s?(mil|milhao|milhoes|bilhao|bilhoes|trilhao|trilhoes|million|billion|trillion|thousand)\b)?/g)) {
    const unit = m[1] === 'r$' ? 'BRL' : m[1] === '€' ? 'EUR' : 'USD'
    push({ news_id: newsId, kind: 'valor_monetario', value: parseNumber(m[2], en) * (SCALE[m[3] ?? ''] ?? 1), unit, text: m[0], context: contextAround(f, m.index!, m[0].length), lead })
  }
  for (const m of f.matchAll(new RegExp(`(\\d+(?:[.,]\\d+)*)\\s?(mil|milhoes|milhao|bilhoes|million|billion|thousand)?\\s+(?:de\\s+)?(${COUNTED})\\b`, 'g'))) {
    push({ news_id: newsId, kind: 'quantidade', value: parseNumber(m[1], en) * (SCALE[m[2] ?? ''] ?? 1), unit: m[3], text: m[0], context: contextAround(f, m.index!, m[0].length), lead })
  }
  return claims
}

const jaccard = (a: string[], b: string[]) => {
  const A = new Set(a)
  const B = new Set(b)
  const inter = [...A].filter((x) => B.has(x)).length
  return A.size + B.size ? inter / (A.size + B.size - inter) : 0
}

export type ClaimComparison = { a: Claim; b: Claim; relation: 'coincide' | 'diverge' }

/**
 * Compara números de fontes INDEPENDENTES que falam da mesma coisa (mesmo tipo/unidade e contexto parecido).
 * Coincidência vale para qualquer trecho; divergência, só entre números do título/resumo (mais conservador).
 * Quantidades arredondadas ("mais de 27 mil" × "27.279") contam como coincidentes (até 5% de diferença).
 */
export function compareClaims(claims: Claim[], groupOf: (newsId: string) => string): ClaimComparison[] {
  const out: ClaimComparison[] = []
  for (let i = 0; i < claims.length; i++)
    for (let j = i + 1; j < claims.length; j++) {
      const a = claims[i]
      const b = claims[j]
      if (a.kind !== b.kind || a.unit !== b.unit || groupOf(a.news_id) === groupOf(b.news_id)) continue
      const sim = jaccard(a.context, b.context)
      if (sim < 0.25) continue
      const diff = Math.abs(a.value - b.value) / Math.max(Math.abs(a.value), Math.abs(b.value), 1e-9)
      const tolerance = a.kind === 'percentual' ? 0.001 : 0.05
      if (diff <= tolerance) out.push({ a, b, relation: 'coincide' })
      // Divergência só entre números do fato principal (título/resumo) com contexto bem parecido:
      // o corpo do texto traz muitos números de outras medidas
      else if (a.lead && b.lead && sim >= 0.5) out.push({ a, b, relation: 'diverge' })
    }
  return out
}

/**
 * Desmentido explícito no título de OUTRA fonte do mesmo assunto indica contradição (sempre vai para revisão humana).
 * Termos genéricos como "nega" ficam de fora: "STF nega pedido" é decisão, não desmentido.
 */
export const DENIAL = /\b(desment\w*|e falso|e falsa|sao falsas?|fake news|boato|nao e verdade|informacao falsa|denies reports?|false claims?|debunk\w*|hoax)\b/

/** Atribuição explícita ("segundo o IBGE", "informou o Ministério da Saúde"). */
export function attributions(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(/\b(?:[Ss]egundo|[Dd]e acordo com|[Cc]onforme|[Ii]nformou|[Ii]nforma|[Dd]ivulgou|[Aa]nunciou|[Aa]ccording to)\s+(?:o |a |os |as |the )?([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ú-]+(?:\s+(?:[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ú-]*|d[aeo]s?)){0,4})/g)) {
    const name = m[1].replace(/\s+d[aeo]s?$/, '').trim()
    if (name.length >= 3) out.add(name)
  }
  return [...out].slice(0, 5)
}
