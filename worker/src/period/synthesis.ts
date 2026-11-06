import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { AIClient } from '../ai/client.ts'
import type { AnalysisInput, AnalysisSource } from '../analysis/prompt.ts'
import { extractJson, numbersIn, allowedNumbers, validateAnalysis, type Analysis } from '../analysis/validate.ts'
import { safeSlice } from '../sources/normalize.ts'
import { addDays, dayMonth, type Entry, type Story } from './stories.ts'

export const SYNTHESIS_VERSION = 'sintese-v1'
export type SynthesisKind = 'sintese_semanal' | 'sintese_mensal'

const LABEL: Record<Entry['kind'], string> = { analise: 'Informativo diário', sintese_semanal: 'Revisão semanal', sintese_mensal: 'Revisão mensal' }

/**
 * Fontes da síntese = os NOSSOS textos anteriores da história (já analisados e auditados contra as matérias
 * originais), em ordem cronológica. A data indicada é a dos FATOS (véspera da edição diária).
 */
export function synthesisSources(story: Story): AnalysisSource[] {
  return story.entries.slice(0, 8).map((e, i) => {
    const first = e.dates[0]
    const last = e.dates.at(-1)!
    const factDate = addDays(first, -1)
    // Só a data dos FATOS aparece (a data da edição confundia a linha do tempo)
    const when = e.dates.length > 1 ? `fatos de ${dayMonth(factDate)} a ${dayMonth(addDays(last, -1))}` : `fatos de ${dayMonth(factDate)}`
    const text = [e.summary, e.whatHappened, ...e.memorize.map((m) => `• ${m}`), ...e.confirmed.map((m) => `• ${m}`)].join(' ')
    return {
      n: i + 1,
      source: `${LABEL[e.kind]} — ${when}`,
      official: false,
      title: e.title,
      url: e.references[0]?.url ?? '',
      published_at: `${factDate}T12:00:00.000Z`,
      text: safeSlice(text.replace(/\s+/g, ' ').trim(), 2400),
    }
  })
}

export function synthesisInput(story: Story, state: string | null): AnalysisInput {
  return {
    block: story.block,
    state,
    category: null,
    verification: { status: 'textos já verificados', independent_sources: story.entries.length, summary: '' },
    sources: synthesisSources(story),
  }
}

/** Mesmas entradas (mesmos textos) + mesma versão = reaproveita a síntese já feita. */
export function synthesisHash(kind: SynthesisKind, story: Story): string {
  const ids = story.entries.map((e) => e.analysisId).sort()
  return createHash('sha256').update(`${SYNTHESIS_VERSION}\n${kind}\n${ids.join(',')}\n${story.dates.join(',')}`).digest('hex')
}

const SYSTEM = `Você é editor de um informativo de atualidades para candidatos a concursos públicos no Brasil.
Você recebe textos JÁ VERIFICADOS que o informativo publicou em dias diferentes sobre o MESMO assunto.
Escreva UM texto único de revisão que conte a evolução do assunto no período, em português do Brasil, tom neutro e didático.

REGRAS OBRIGATÓRIAS
1. Use SOMENTE as informações dos TEXTOS fornecidos. Não acrescente fatos, números, datas, nomes, cargos ou leis.
2. Todo número, percentual, valor ou data deve constar nos textos. Se não constar, não escreva.
3. Mostre a sequência dos acontecimentos: o desfecho mais recente vale mais que o anterior (se um fato foi superado, diga isso).
4. "linha_do_tempo": um item por acontecimento relevante, em ordem cronológica, usando a data dos fatos indicada ao lado de cada texto (formato DD/MM).
5. Projeções e consequências futuras vão em "projecoes", como possibilidades.
6. Não opine nem tome partido. Ortografia oficial com acentuação completa.
7. Gere 2 questões NOVAS de revisão sobre o período (preferencialmente sobre a evolução do assunto), cada uma com uma única alternativa correta.
8. Responda APENAS com um objeto JSON válido, sem texto antes ou depois, sem markdown.`

const FORMAT = `FORMATO (JSON):
{
  "titulo_editorial": "título que resume o assunto no período, até 110 caracteres",
  "resumo": "2 a 3 frases com o essencial do período",
  "o_que_aconteceu": "1 a 2 parágrafos contando a evolução dos fatos",
  "linha_do_tempo": [{ "data": "DD/MM", "fato": "o que aconteceu nessa data" }],
  "contexto": "ou \\"\\"",
  "antecedentes": "ou \\"\\"",
  "analise_politica": "ou \\"\\"",
  "analise_economica": "ou \\"\\"",
  "impacto_social": "ou \\"\\"",
  "por_que_importa": "1 parágrafo",
  "consequencias": { "confirmadas": [], "projecoes": [] },
  "relevancia_para_concursos": "por que o tema pode cair em prova",
  "temas_de_prova": ["3 a 6 temas"],
  "memorizar": ["3 a 6 fatos curtos e verificáveis nos textos"],
  "abordagens_em_prova": ["2 a 4 formas de cobrança"],
  "questoes": [{ "enunciado": "", "alternativas": { "A": "", "B": "", "C": "", "D": "", "E": "" }, "gabarito": "A", "comentario": "" }],
  "referencias": []
}`

export function buildSynthesisMessages(input: AnalysisInput, kind: SynthesisKind) {
  const texts = input.sources.map((s) => `[${s.n}] ${s.source}\nTítulo: ${s.title}\nTexto: ${s.text}`).join('\n\n')
  const period = kind === 'sintese_semanal' ? 'da SEMANA' : 'do MÊS'
  return [
    { role: 'system' as const, content: SYSTEM },
    { role: 'user' as const, content: `Revisão ${period} — bloco ${input.block}${input.state ? ` (UF ${input.state})` : ''}.\n\nTEXTOS:\n${texts}\n\n${FORMAT}` },
  ]
}

const timelineSchema = z.array(z.object({ data: z.string().trim().max(20), fato: z.string().trim().min(3).max(400) })).min(2).max(10)
export type Timeline = z.infer<typeof timelineSchema>

export type SynthesisValidation = { ok: true; data: Analysis; timeline: Timeline; warnings: string[] } | { ok: false; errors: string[]; warnings: string[] }

/** Mesma validação das análises (números ancorados, acentuação, nomes) + linha do tempo com datas do período. */
export function validateSynthesis(raw: string, input: AnalysisInput): SynthesisValidation {
  const base = validateAnalysis(raw, input, { allowCopy: true })
  let timeline: Timeline | null = null
  const errors = base.ok ? [] : [...base.errors]
  try {
    const t = timelineSchema.safeParse((extractJson(raw) as { linha_do_tempo?: unknown }).linha_do_tempo)
    if (t.success) timeline = t.data
    else errors.push(`linha_do_tempo: ${t.error.issues[0]?.message ?? 'inválida'} (2 a 10 itens com "data" e "fato")`)
  } catch {
    /* JSON inválido já reportado */
  }
  if (timeline) {
    const allowed = allowedNumbers(input)
    // Datas válidas: a data dos fatos de cada texto ou uma data DD/MM escrita nos próprios textos
    const dd = (d: string, m: string) => `${d.padStart(2, '0')}/${m.padStart(2, '0')}`
    const validDates = new Set<string>()
    for (const src of input.sources) {
      if (src.published_at) validDates.add(dayMonth(src.published_at.slice(0, 10)))
      for (const m of `${src.title} ${src.text}`.matchAll(/\b(\d{1,2})\/(\d{1,2})\b/g)) validDates.add(dd(m[1], m[2]))
    }
    timeline.forEach((t, i) => {
      const m = t.data.match(/^(\d{1,2})\/(\d{1,2})$/)
      if (!m) errors.push(`linha_do_tempo[${i}].data: use DD/MM`)
      else if (!validDates.has(dd(m[1], m[2]))) errors.push(`linha_do_tempo[${i}].data: ${t.data} não é a data dos fatos de nenhum texto (válidas: ${[...validDates].join(', ')})`)
      const bad = numbersIn(t.fato).filter((n) => !allowed.has(n))
      if (bad.length) errors.push(`linha_do_tempo[${i}].fato: número(s) sem origem nos textos: ${[...new Set(bad)].join(', ')}`)
    })
  }
  if (errors.length || !base.ok) return { ok: false, errors, warnings: base.warnings }
  return { ok: true, data: base.data, timeline: timeline!, warnings: base.warnings }
}

/** Referências da síntese = as das análises de origem (sem repetir; oficiais primeiro). */
export function mergeReferences(story: Story) {
  const seen = new Set<string>()
  return story.entries
    .flatMap((e) => e.references)
    .filter((r) => r?.url && !seen.has(r.url) && seen.add(r.url))
    .sort((a, b) => Number(b.official) - Number(a.official))
    .slice(0, 12)
}

export type SynthesisResult =
  | { status: 'valid'; data: Analysis; timeline: Timeline; warnings: string[]; provider: string; model: string; calls: number }
  | { status: 'invalid'; raw: string; errors: string[]; provider: string; model: string; calls: number }

/** Gera e valida; pede UMA correção se inválida (como nas análises). */
export async function generateSynthesis(ai: AIClient, models: string[], input: AnalysisInput, kind: SynthesisKind, jobId: string | null): Promise<SynthesisResult> {
  const messages = buildSynthesisMessages(input, kind)
  const first = await ai.chat(models, { messages, maxTokens: 4000, temperature: 0.2, timeoutMs: 150_000 }, { task: 'synthesis', jobId })
  const v1 = validateSynthesis(first.text, input)
  if (v1.ok) return { status: 'valid', data: v1.data, timeline: v1.timeline, warnings: v1.warnings, provider: first.provider, model: first.model, calls: 1 }
  await ai.markInvalid(first, 'synthesis', jobId, v1.errors.join(' | '))
  const fix = [
    ...messages,
    { role: 'assistant' as const, content: first.text.slice(0, 12_000) },
    { role: 'user' as const, content: `A resposta violou as regras:\n- ${v1.errors.join('\n- ')}\nReescreva o JSON completo corrigindo esses pontos. Responda só com o JSON.` },
  ]
  const second = await ai.chat([first.model], { messages: fix, maxTokens: 4000, temperature: 0.1, timeoutMs: 150_000 }, { task: 'synthesis_fix', jobId })
  const v2 = validateSynthesis(second.text, input)
  if (v2.ok) return { status: 'valid', data: v2.data, timeline: v2.timeline, warnings: [...v2.warnings, `corrigida após: ${v1.errors.join('; ')}`], provider: second.provider, model: second.model, calls: 2 }
  await ai.markInvalid(second, 'synthesis_fix', jobId, v2.errors.join(' | '))
  return { status: 'invalid', raw: second.text.slice(0, 20_000), errors: v2.errors, provider: second.provider, model: second.model, calls: 2 }
}
