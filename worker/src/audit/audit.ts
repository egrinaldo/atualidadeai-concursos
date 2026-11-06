import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { AnalysisSource } from '../analysis/prompt.ts'
import { extractJson } from '../analysis/validate.ts'

/**
 * Auditoria de veracidade: um segundo modelo (diferente do redator) separa as afirmações factuais do texto
 * e, para cada uma, aponta a fonte e copia o TRECHO LITERAL que a sustenta. O sistema confere — sem IA —
 * se o trecho existe mesmo na fonte. Sem trecho verificável, a afirmação é tratada como "sem suporte".
 */
export const AUDIT_PROMPT_VERSION = 'auditoria-v2'

export type AuditTarget = {
  title: string
  summary: string
  whatHappened: string
  memorize: string[]
  confirmed: string[]
  timeline?: string[] // sínteses: "DD/MM: fato"
  questions: { statement: string; correct: string; comment: string }[]
}

/** Questão do tipo "assinale a INCORRETA": a alternativa do gabarito deve ser FALSA segundo as fontes. */
export const isNegativeQuestion = (statement: string) => /\b(incorret[ao]s?|errad[ao]s?|fals[ao]s?|exceto|não (é|está|corresponde)|nao (e|esta|corresponde))\b/i.test(statement)

const SYSTEM = `Você é auditor de fatos de um informativo para concursos públicos. Sua única tarefa é conferir se o TEXTO está sustentado pelas FONTES.

Para o TEXTO abaixo:
1. Separe TODAS as afirmações factuais verificáveis, uma por item e ATÔMICAS (um único fato por afirmação: quem, o quê, quando, onde, quanto, cargo, número, data, nome, lei, resultado). Frase com vários fatos vira várias afirmações. Ignore opiniões e frases genéricas.
2. Para cada afirmação, procure nas FONTES e classifique:
   - "apoiada": a fonte diz isso (mesmo com outras palavras);
   - "parcial": a fonte sustenta só parte, ou o texto exagera/generaliza;
   - "sem_suporte": nenhuma fonte diz isso;
   - "contradita": alguma fonte diz o contrário (número, data, nome ou fato diferente).
3. Para "apoiada", "parcial" e "contradita", copie em "trecho" um pedaço LITERAL da fonte (entre 5 e 40 palavras, copiado exatamente, no idioma original da fonte) e indique "fonte" com o número dela.
4. Seja rigoroso com números, datas, nomes próprios e cargos: qualquer diferença é "contradita".
   O trecho precisa dizer O MESMO FATO, não algo de que ele possa ser deduzido: "segue no cargo" não sustenta "foi reeleita"; "foi eleita em 2012" não sustenta "foi eleita agora"; "deve votar" não sustenta "aprovou". Dedução, generalização ou mudança de tempo verbal = "parcial" (se a fonte não diz) ou "sem_suporte". Na dúvida entre "apoiada" e "parcial", marque "parcial".
5. O ano de uma data pode ser deduzido pela data de publicação da fonte (indicada ao lado do nome dela): isso não é "sem_suporte".
6. Em "QUESTÃO … (pede a alternativa INCORRETA)", a resposta marcada DEVE ser falsa: audite-a com campo "questao_incorreta" — veredito "contradita" se as fontes a desmentem (o esperado) ou "apoiada" se as fontes a confirmam (erro da questão).
Responda APENAS com JSON válido, sem texto fora dele.`

export function buildAuditMessages(target: AuditTarget, sources: AnalysisSource[]) {
  const text = [
    `TÍTULO: ${target.title}`,
    `RESUMO: ${target.summary}`,
    `O QUE ACONTECEU: ${target.whatHappened}`,
    ...target.memorize.map((m, i) => `PARA MEMORIZAR ${i + 1}: ${m}`),
    ...target.confirmed.map((m, i) => `EFEITO CONFIRMADO ${i + 1}: ${m}`),
    ...(target.timeline ?? []).map((m, i) => `LINHA DO TEMPO ${i + 1}: ${m}`),
    ...target.questions.map((q, i) =>
      isNegativeQuestion(q.statement)
        ? `QUESTÃO ${i + 1} (pede a alternativa INCORRETA) — enunciado: ${q.statement} — alternativa marcada como incorreta: ${q.correct} — comentário: ${q.comment}`
        : `QUESTÃO ${i + 1} — enunciado: ${q.statement} — resposta correta: ${q.correct} — comentário: ${q.comment}`,
    ),
  ].join('\n')
  const src = sources.map((s) => `[${s.n}] ${s.source}${s.published_at ? ` (${s.published_at.slice(0, 10)})` : ''}\nTítulo: ${s.title}\nTexto: ${s.text}`).join('\n\n')
  const format = `FORMATO:
{"afirmacoes": [{"campo": "resumo|o_que_aconteceu|memorizar|efeito|linha_do_tempo|questao|questao_incorreta|titulo", "afirmacao": "...", "veredito": "apoiada|parcial|sem_suporte|contradita", "fonte": 1, "trecho": "trecho literal da fonte", "observacao": "explique em 1 frase se não for apoiada"}]}`
  return [
    { role: 'system' as const, content: SYSTEM },
    { role: 'user' as const, content: `FONTES:\n${src}\n\nTEXTO A AUDITAR:\n${text}\n\n${format}` },
  ]
}

// Tolerante a excessos de tamanho (corta) — o que importa é o veredito e o trecho, conferido depois
const cut = (n: number) => z.string().transform((s) => s.slice(0, n))
const claimSchema = z.object({
  campo: cut(40),
  afirmacao: z.string().min(3).transform((s) => s.slice(0, 600)),
  veredito: z.enum(['apoiada', 'parcial', 'sem_suporte', 'contradita']),
  fonte: z.union([z.number(), z.string()]).optional().nullable(),
  trecho: cut(1200).optional().nullable(),
  observacao: cut(600).optional().nullable(),
})
const auditSchema = z.object({ afirmacoes: z.array(claimSchema).min(1).max(80) })

export type Verdict = 'apoiada' | 'parcial' | 'sem_suporte' | 'contradita'
export type AuditedClaim = { field: string; claim: string; verdict: Verdict; source: number | null; quote: string | null; quoteFound: boolean; note: string | null }
export type AuditReport = {
  status: 'aprovada' | 'reprovada'
  claims: AuditedClaim[]
  summary: { total: number; apoiada: number; parcial: number; sem_suporte: number; contradita: number; quotes_not_found: number }
  problems: string[]
  checks: string[] // verificações determinísticas (datas/dias da semana…)
}

const norm = (s: string) =>
  // Pontuação some (inclusive vírgula/ponto: "565/20 , que" na fonte = "565/20, que" no trecho)
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[“”"'’‘«»]/g, '').replace(/[^\p{L}\p{N}%$€]+/gu, ' ').replace(/\s+/g, ' ').trim()

/**
 * O trecho citado existe na fonte? Comparação sem acentos/pontuação. O auditor às vezes junta frases que, na
 * fonte, estão separadas por outra coisa ("Notícias relacionadas…") ou usa reticências: cada FRASE do trecho
 * precisa existir literalmente na fonte (frases de menos de 3 palavras são ignoradas; o trecho precisa de 3+ palavras, 2 delas com 4+ letras ou números).
 */
export function quoteInSource(quote: string, sourceText: string): boolean {
  const words = norm(quote).split(' ')
  // Trecho curto só vale se tiver conteúdo: 2+ palavras de 4+ letras ou com números ("precursor chemicals",
  // "refinanciamentos sem autorização", "das 13h às 17h" sim; "o presidente" não)
  if (words.filter((w) => w.length >= 4 || /\d/.test(w)).length < 2) return false
  const src = ` ${norm(sourceText)} ` // espaços nas pontas: só casa palavra inteira
  const SPLIT = /\s*[[(]\s*(?:\.{3}|…)\s*[\])]\s*|\s*\.{3}\s*|\s*…\s*|(?<=[.!?;])\s+(?=[\p{Lu}“"«(\d])/u
  const parts0 = quote.split(SPLIT).filter((p) => norm(p)).length
  const parts = quote
    .split(SPLIT)
    .map((p) => norm(p))
    .filter((p) => p.split(' ').length >= (parts0 > 1 ? 3 : 2))
  return parts.length > 0 && parts.every((part) => src.includes(` ${part} `))
}

const WEEKDAYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']

/** Dia da semana citado junto a uma data ("quinta-feira (05/11)") confere com o calendário? */
export function weekdayDateIssues(text: string, year: number): string[] {
  const out: string[] = []
  const t = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  for (const m of t.matchAll(/\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?,?\s*(?:\(|dia\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/g)) {
    const y = m[4] ? (m[4].length === 2 ? 2000 + Number(m[4]) : Number(m[4])) : year
    const d = new Date(Date.UTC(y, Number(m[3]) - 1, Number(m[2]), 12))
    if (Number.isNaN(d.getTime()) || d.getUTCMonth() !== Number(m[3]) - 1) {
      out.push(`data inexistente: ${m[0]}`)
      continue
    }
    if (WEEKDAYS[d.getUTCDay()] !== m[1]) out.push(`dia da semana não confere: "${m[0]}" (${m[2]}/${m[3]}/${y} foi ${WEEKDAYS[d.getUTCDay()]})`)
  }
  return out
}

const CRITICAL = new Set(['titulo', 'resumo', 'o_que_aconteceu', 'memorizar', 'questao', 'efeito', 'linha_do_tempo'])

/**
 * Confere as citações e decide. Reprova se houver afirmação contradita ou sem suporte em campo crítico,
 * parcial em título/"para memorizar"/questão, mais de 2 "parciais" no total, ou se a verificação de datas falhar.
 */
export function judge(raw: string, sources: AnalysisSource[], target: AuditTarget, year: number): AuditReport {
  let parsed
  try {
    parsed = auditSchema.parse(extractJson(raw))
  } catch (e) {
    throw new Error(`resposta do auditor inválida: ${(e as Error).message.slice(0, 200)}`)
  }
  // O cabeçalho da fonte (veículo + data de publicação) também vale como trecho: a regra 5 permite tirar a data dele
  const byN = new Map(sources.map((s) => [s.n, `${s.source}${s.published_at ? ` (${s.published_at.slice(0, 10)})` : ''}. ${s.title}. ${s.text}`]))
  const claims: AuditedClaim[] = parsed.afirmacoes.map((c) => {
    const n = c.fonte == null ? null : Number(String(c.fonte).replace(/\D/g, '')) || null
    const quote = c.trecho?.trim() || null
    const found = !!(quote && n && byN.has(n) && quoteInSource(quote, byN.get(n)!))
      || !!(quote && [...byN.values()].some((t) => quoteInSource(quote, t))) // fonte indicada errada, trecho existe em outra
    let verdict: Verdict = c.veredito
    let note = c.observacao?.trim() || null
    // "apoiada"/"parcial" sem trecho verificável não vale: vira sem suporte
    if ((verdict === 'apoiada' || verdict === 'parcial') && !found) {
      verdict = 'sem_suporte'
      note = `trecho citado não encontrado nas fontes${note ? ` (${note})` : ''}`
    }
    return { field: c.campo.toLowerCase(), claim: c.afirmacao, verdict, source: n, quote, quoteFound: found, note }
  })
  const count = (v: Verdict) => claims.filter((c) => c.verdict === v).length
  const allText = [target.title, target.summary, target.whatHappened, ...target.memorize, ...target.confirmed, ...(target.timeline ?? []), ...target.questions.flatMap((q) => [q.statement, q.correct, q.comment])].join(' ')
  const checks = weekdayDateIssues(allText, year)
  const problems: string[] = []
  for (const c of claims) {
    // Questão "assinale a incorreta": o esperado é a alternativa ser desmentida pelas fontes
    if (c.field.includes('incorret')) {
      if (c.verdict === 'apoiada') problems.push(`questão pede a alternativa incorreta, mas a marcada é verdadeira segundo as fontes: "${c.claim}"`)
      continue
    }
    const critical = CRITICAL.has(c.field.replace(/[^a-z_]/g, '')) || c.field.startsWith('quest') || c.field.startsWith('memor')
    if (c.verdict === 'contradita') problems.push(`contradita: "${c.claim}"${c.note ? ` — ${c.note}` : ''}`)
    else if (c.verdict === 'sem_suporte' && critical) problems.push(`sem suporte nas fontes: "${c.claim}"${c.note ? ` — ${c.note}` : ''}`)
    // O que o aluno decora ou responde precisa estar exato: parcial em título, "para memorizar" e questão reprova
    else if (c.verdict === 'parcial' && /^(titulo|memor|quest)/.test(c.field)) problems.push(`só parcialmente sustentada (${c.field}): "${c.claim}"${c.note ? ` — ${c.note}` : ''}`)
  }
  if (count('parcial') > 2) problems.push(`${count('parcial')} afirmações só parcialmente sustentadas`)
  problems.push(...checks)
  return {
    status: problems.length ? 'reprovada' : 'aprovada',
    claims,
    summary: { total: claims.length, apoiada: count('apoiada'), parcial: count('parcial'), sem_suporte: count('sem_suporte'), contradita: count('contradita'), quotes_not_found: claims.filter((c) => c.quote && !c.quoteFound).length },
    problems,
    checks,
  }
}

/** Mesmo texto + mesmas fontes + mesma versão = não reaudita. */
export function auditHash(target: AuditTarget, sources: AnalysisSource[]): string {
  return createHash('sha256').update(AUDIT_PROMPT_VERSION + JSON.stringify(target) + JSON.stringify(sources.map((s) => [s.url, s.text]))).digest('hex')
}
