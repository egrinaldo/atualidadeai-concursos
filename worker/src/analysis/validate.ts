import { z } from 'zod'
import type { AnalysisInput } from './prompt.ts'

const text = (max: number) => z.string().trim().max(max)
const filled = (max: number) => z.string().trim().min(1).max(max)
const list = (min: number, max: number, each = 400) => z.array(filled(each)).min(min).max(max)

export const analysisSchema = z.object({
  titulo_editorial: filled(160),
  resumo: filled(900),
  o_que_aconteceu: filled(2500),
  contexto: text(2500),
  antecedentes: text(2500),
  analise_politica: text(2000),
  analise_economica: text(2000),
  impacto_social: text(2000),
  por_que_importa: filled(2000),
  consequencias: z.object({ confirmadas: z.array(filled(400)).max(6), projecoes: z.array(filled(400)).max(6) }),
  relevancia_para_concursos: filled(1500),
  temas_de_prova: list(2, 8, 120),
  memorizar: list(2, 8, 300),
  abordagens_em_prova: list(1, 6, 400),
  questoes: z
    .array(
      z.object({
        enunciado: filled(1200),
        alternativas: z.object({ A: filled(400), B: filled(400), C: filled(400), D: filled(400), E: filled(400) }),
        gabarito: z.enum(['A', 'B', 'C', 'D', 'E']),
        comentario: filled(1200),
      }),
    )
    .min(1)
    .max(3),
  referencias: z.array(z.string()).max(10),
})
export type Analysis = z.infer<typeof analysisSchema>

/** Palavras comuns que, sem acento, denunciam texto sem acentuação (escolhidas por não terem forma válida sem acento). */
const UNACCENTED = /\b(nao|tambem|publicos?|publicas?|economic[oa]s?|politic[oa]s?|saude|educacao|informacao|informacoes|decisao|populacao|sustentavel|orgaos?|reuniao|eleicoes|acao|acoes|historic[oa]s?|juridic[oa]s?|tecnic[oa]s?|numeros?|unic[oa]s?|minim[oa]s?|maxim[oa]s?|possivel|relevancia|violencia|seguranca|situacao|comissao|divida|paises|secretario|conselho economico)\b/g

/** Quantas palavras distintas aparecem sem acento (3 ou mais = texto sem acentuação). */
export function unaccentedWords(text: string): string[] {
  return [...new Set((text.toLowerCase().match(UNACCENTED) ?? []))]
}

/** Extrai o objeto JSON da resposta (tolera cercas de markdown e texto ao redor). */
export function extractJson(raw: string): unknown {
  const s = raw.replace(/```(?:json)?/gi, '')
  const a = s.indexOf('{')
  const b = s.lastIndexOf('}')
  if (a < 0 || b <= a) throw new Error('resposta sem objeto JSON')
  return JSON.parse(s.slice(a, b + 1))
}

/** Números de um texto, normalizados ("27.279" → "27279"; "0,8" → "0.8"; sinal ignorado). */
export function numbersIn(s: string): string[] {
  return [...s.matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => {
    const t = m[0]
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return t.replace(/\./g, '').replace(',', '.')
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return t.replace(/,/g, '') // formato inglês 1,000.5
    return t.replace(',', '.')
  }).map((n) => n.replace(/^0+(?=\d)/, ''))
}

/** Números permitidos: os que aparecem nas fontes (títulos, textos, URLs, datas) e inteiros pequenos (0–12). */
export function allowedNumbers(input: AnalysisInput): Set<string> {
  const set = new Set<string>(Array.from({ length: 13 }, (_, i) => String(i)))
  for (const s of input.sources) {
    for (const n of numbersIn(`${s.title} ${s.text} ${s.url}`)) set.add(n) // URL: ex. nº do comunicado da ONU (sc16501)
    if (s.published_at) for (const n of s.published_at.slice(0, 10).split('-')) set.add(String(Number(n)))
  }
  return set
}

export type Validation = { ok: true; data: Analysis; warnings: string[] } | { ok: false; errors: string[]; warnings: string[] }

/**
 * Valida formato (schema) e ancoragem nas fontes:
 * - fatal: número sem origem nas fontes em campos factuais (título, resumo, fatos, "memorizar",
 *   consequências confirmadas, enunciado/comentário e alternativa correta das questões);
 * - aviso: número sem origem em contexto/antecedentes/análises (vai para revisão), referência fora das fontes (removida).
 */
export function validateAnalysis(raw: string, input: AnalysisInput): Validation {
  let parsed: unknown
  try {
    parsed = extractJson(raw)
  } catch (e) {
    return { ok: false, errors: [`JSON inválido: ${(e as Error).message}`], warnings: [] }
  }
  const r = analysisSchema.safeParse(parsed)
  if (!r.success) return { ok: false, errors: r.error.issues.slice(0, 10).map((i) => `${i.path.join('.') || 'raiz'}: ${i.message}`), warnings: [] }
  const data = r.data
  const errors: string[] = []
  const warnings: string[] = []
  const allowed = allowedNumbers(input)
  const check = (field: string, value: string, fatal: boolean, extra?: Set<string>) => {
    const bad = [...new Set(numbersIn(value).filter((n) => !allowed.has(n) && !extra?.has(n)))]
    if (bad.length) (fatal ? errors : warnings).push(`${field}: número(s) sem origem nas fontes: ${bad.join(', ')}`)
  }
  check('titulo_editorial', data.titulo_editorial, true)
  check('resumo', data.resumo, true)
  check('o_que_aconteceu', data.o_que_aconteceu, true)
  data.memorizar.forEach((m, i) => check(`memorizar[${i}]`, m, true))
  data.consequencias.confirmadas.forEach((m, i) => check(`consequencias.confirmadas[${i}]`, m, true))
  data.questoes.forEach((q, i) => {
    check(`questoes[${i}].enunciado`, q.enunciado, true)
    // O comentário pode citar os valores das alternativas erradas para explicar o erro
    check(`questoes[${i}].comentario`, q.comentario, true, new Set(Object.values(q.alternativas).flatMap(numbersIn)))
    check(`questoes[${i}].alternativa_correta`, q.alternativas[q.gabarito], true) // distratores podem ter números errados de propósito
    const alts = Object.values(q.alternativas).map((a) => a.toLowerCase())
    if (new Set(alts).size < 5) errors.push(`questoes[${i}]: alternativas repetidas`)
  })
  for (const f of ['contexto', 'antecedentes', 'analise_politica', 'analise_economica', 'impacto_social', 'por_que_importa', 'relevancia_para_concursos'] as const) check(f, data[f], false)
  data.consequencias.projecoes.forEach((m, i) => check(`consequencias.projecoes[${i}]`, m, false))

  const prose = [data.titulo_editorial, data.resumo, data.o_que_aconteceu, data.contexto, data.por_que_importa, data.relevancia_para_concursos, ...data.memorizar].join(' ')
  const noAccents = unaccentedWords(prose)
  if (noAccents.length >= 3) errors.push(`texto sem acentuação (ex.: ${noAccents.slice(0, 5).join(', ')}): reescreva com a ortografia oficial`)
  const english = prose.match(/\b(General Assembly|Security Council|Secretary-General|Committee|Council)\b/g)
  if (english) warnings.push(`nomes em inglês no texto: ${[...new Set(english)].join(', ')}`)

  const urls = new Set(input.sources.map((s) => s.url))
  const foreign = data.referencias.filter((u) => !urls.has(u))
  if (foreign.length) warnings.push(`referências fora das fontes removidas: ${foreign.length}`)
  data.referencias = data.referencias.filter((u) => urls.has(u))
  if (!data.referencias.length) data.referencias = [...urls]

  return errors.length ? { ok: false, errors, warnings } : { ok: true, data, warnings }
}
