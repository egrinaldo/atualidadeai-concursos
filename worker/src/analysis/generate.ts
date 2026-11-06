import type { AIClient } from '../ai/client.ts'
import { buildMessages, type AnalysisInput } from './prompt.ts'
import { validateAnalysis, type Analysis } from './validate.ts'

export const ANALYSIS_MAX_TOKENS = 3500

export type Generated =
  | { status: 'valid'; data: Analysis; warnings: string[]; provider: string; model: string; calls: number }
  | { status: 'invalid'; raw: string; errors: string[]; warnings: string[]; provider: string; model: string; calls: number }

/**
 * Gera a análise e valida (formato + números ancorados nas fontes). Se inválida,
 * devolve os erros ao modelo e pede correção UMA vez; persistindo, fica registrada como inválida
 * (o assunto vai para revisão humana — nada inválido segue para o PDF).
 */
export async function generateAnalysis(ai: AIClient, models: string[], input: AnalysisInput, ctx: { jobId: string | null }): Promise<Generated> {
  const messages = buildMessages(input)
  const first = await ai.chat(models, { messages, maxTokens: ANALYSIS_MAX_TOKENS, temperature: 0.2, timeoutMs: 150_000 }, { task: 'analysis', jobId: ctx.jobId })
  const v1 = validateAnalysis(first.text, input)
  if (v1.ok) return { status: 'valid', data: v1.data, warnings: v1.warnings, provider: first.provider, model: first.model, calls: 1 }
  await ai.markInvalid(first, 'analysis', ctx.jobId, v1.errors.join(' | '))

  const fix = [
    ...messages,
    { role: 'assistant' as const, content: first.text.slice(0, 12_000) },
    { role: 'user' as const, content: `A resposta violou as regras:\n- ${v1.errors.join('\n- ')}\nReescreva o JSON completo corrigindo esses pontos. Remova qualquer número que não esteja nas fontes. Responda só com o JSON.` },
  ]
  // A correção usa o mesmo modelo que respondeu (mantém o estilo e evita gastar cota com outro)
  const second = await ai.chat([first.model], { messages: fix, maxTokens: ANALYSIS_MAX_TOKENS, temperature: 0.1, timeoutMs: 150_000 }, { task: 'analysis_fix', jobId: ctx.jobId })
  const v2 = validateAnalysis(second.text, input)
  if (v2.ok) return { status: 'valid', data: v2.data, warnings: [...v1.warnings, ...v2.warnings, `corrigida após: ${v1.errors.join('; ')}`], provider: second.provider, model: second.model, calls: 2 }
  await ai.markInvalid(second, 'analysis_fix', ctx.jobId, v2.errors.join(' | '))
  return { status: 'invalid', raw: second.text.slice(0, 20_000), errors: v2.errors, warnings: v2.warnings, provider: second.provider, model: second.model, calls: 2 }
}

/** Converte a análise validada nas colunas de news_analyses. */
export function toAnalysisRow(data: Analysis, input: AnalysisInput) {
  const byUrl = new Map(input.sources.map((s) => [s.url, s]))
  return {
    editorial_title: data.titulo_editorial,
    summary: data.resumo,
    what_happened: data.o_que_aconteceu,
    context: data.contexto || null,
    historical_background: data.antecedentes || null,
    political_analysis: data.analise_politica || null,
    economic_analysis: data.analise_economica || null,
    social_impact: data.impacto_social || null,
    why_it_matters: data.por_que_importa,
    consequences: { confirmados: data.consequencias.confirmadas, projecoes: data.consequencias.projecoes },
    relevance_for_exams: data.relevancia_para_concursos,
    possible_exam_topics: data.temas_de_prova,
    memorize: data.memorizar,
    exam_approaches: data.abordagens_em_prova,
    questions: data.questoes,
    references: data.referencias.map((url) => ({ url, source: byUrl.get(url)?.source ?? null, title: byUrl.get(url)?.title ?? null, official: byUrl.get(url)?.official ?? false })),
    content: data,
  }
}
