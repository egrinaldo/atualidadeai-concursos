/** Utilidades de texto para triagem e agrupamento (sem dependências externas). */

/** Minúsculas, sem acentos, espaços normalizados. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const STOP_PT = new Set(
  ('a o e os as um uma uns umas de do da dos das em no na nos nas por pelo pela pelos pelas para pra com sem sob sobre entre ' +
    'que se ao aos ou mas mais menos muito muita como quando onde ja nao sim seu sua seus suas ele ela eles elas isso este esta ' +
    'esse essa ate apos durante tambem ser sao foi era tem ter vai vao pode deve diz dizem afirma segundo novo nova novos novas ' +
    'hoje ontem amanha dia dias ano anos mes partir sera serao estao esta estar sera cerca mil milhoes bilhoes').split(' '),
)
const STOP_EN = new Set(
  ('the a an and or of to in on at by for with from as is are was were be been it its this that these those into over under ' +
    'about after before during new says said will would can could has have had not no more most than also their his her they ' +
    'we our you your which who whom what when where while including').split(' '),
)
const STOP_ES = new Set('el la los las un una unos unas de del y o en por para con sin sobre que se al es son fue como mas pero'.split(' '))
const STOP_FR = new Set('le la les un une des de du et ou en par pour avec sans sur que qui se au aux est sont dans pas plus'.split(' '))

/** Idioma provável pelo número de palavras funcionais (pt, en, es, fr); `fallback` se inconclusivo. */
export function detectLanguage(text: string, fallback = 'pt'): string {
  const words = fold(text).match(/[a-z]+/g) ?? []
  if (words.length < 4) return fallback
  const score = { pt: 0, en: 0, es: 0, fr: 0 }
  for (const w of words) {
    if (STOP_PT.has(w)) score.pt++
    if (STOP_EN.has(w)) score.en++
    if (STOP_ES.has(w)) score.es++
    if (STOP_FR.has(w)) score.fr++
  }
  // Sinais exclusivos do português (til e cedilha)
  score.pt += (text.match(/[ãõç]/gi) ?? []).length * 2
  const best = (Object.entries(score) as [string, number][]).sort((a, b) => b[1] - a[1])
  if (best[0][1] === 0 || best[0][1] === best[1][1]) return fallback
  return best[0][0]
}

/**
 * Radical simples: prefixo de até 5 letras (técnica clássica e robusta para português/inglês):
 * "indústria"/"industrial" → "indus", "recenseadores"/"recenseador" → "recen".
 */
export function stem(word: string): string {
  return word.length <= 5 ? word.replace(/s$/, '') : word.slice(0, 5)
}

/**
 * Tokens para comparação: radicais sem palavras funcionais e números normalizados
 * ("-0,8%" → "#0.8", "27.279" → "#27279").
 */
export function tokens(text: string): string[] {
  const out: string[] = []
  const f = fold(text)
  for (const m of f.matchAll(/\d+(?:[.,]\d+)*|[a-z]+/g)) {
    const t = m[0]
    if (/^\d/.test(t)) {
      // 27.279 (milhar) → 27279; 0,8 / 0.8 (decimal) → 0.8
      const n = /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t.replace(',', '.')
      out.push('#' + n)
      continue
    }
    if (t.length < 3 || STOP_PT.has(t) || STOP_EN.has(t)) continue
    out.push(stem(t))
  }
  return out
}

export type Vector = Map<string, number>

/** Frequência de documentos de cada token no corpus (para IDF). */
export function documentFrequency(docs: string[][]): Map<string, number> {
  const df = new Map<string, number>()
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1)
  return df
}

/** Vetor TF-IDF com peso maior para o título. */
export function vectorize(title: string, body: string, df: Map<string, number>, nDocs: number): Vector {
  const v: Vector = new Map()
  const add = (toks: string[], w: number) => {
    for (const t of new Set(toks)) {
      const idf = Math.log((nDocs + 1) / ((df.get(t) ?? 0) + 1)) + 1
      v.set(t, (v.get(t) ?? 0) + w * idf)
    }
  }
  add(tokens(title), 2)
  add(tokens(body).slice(0, 60), 1)
  return v
}

export function cosine(a: Vector, b: Vector): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (const [k, x] of a) {
    na += x * x
    const y = b.get(k)
    if (y) dot += x * y
  }
  for (const y of b.values()) nb += y * y
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}
