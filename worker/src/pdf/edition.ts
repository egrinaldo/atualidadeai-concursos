import { eligible, type Candidate, type SelectionPolicy } from '../analysis/select.ts'
import type { BlockKey, EditionType } from './model.ts'

/** Brasil não tem horário de verão desde 2019: Brasília = UTC−3 o ano todo. */
const BRT_OFFSET_H = -3

/** Data (AAAA-MM-DD) em Brasília. */
export function brtDate(d: Date): string {
  return new Date(d.getTime() + BRT_OFFSET_H * 3_600_000).toISOString().slice(0, 10)
}
const addDays = (isoDate: string, n: number) => new Date(Date.parse(`${isoDate}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/**
 * Data da edição a montar: a edição publicada às 06h de amanhã é montada depois do fechamento (22h) de hoje.
 * A partir do meio-dia (Brasília), a referência é o dia seguinte; antes disso, o próprio dia.
 */
export function referenceDateFor(now: Date): string {
  const today = brtDate(now)
  const hour = (now.getUTCHours() + 24 + BRT_OFFSET_H) % 24
  return hour >= 12 ? addDays(today, 1) : today
}

/** Edições do dia: diária sempre; semanal às segundas; mensal no dia 1. */
export function editionTypesFor(referenceDate: string): EditionType[] {
  const d = new Date(`${referenceDate}T12:00:00Z`)
  const types: EditionType[] = ['diaria']
  if (d.getUTCDay() === 1) types.push('semanal')
  if (d.getUTCDate() === 1) types.push('mensal')
  return types
}

/**
 * Janela coberta pela edição: termina no fechamento (padrão 22h) da véspera da publicação.
 * Diária: 24h; semanal: 7 dias; mensal: o mês anterior inteiro.
 */
export function editionWindow(type: EditionType, referenceDate: string, cutoff = '22:00'): { start: string; end: string } {
  const [h, m] = cutoff.split(':').map(Number)
  const eve = addDays(referenceDate, -1)
  const end = new Date(Date.parse(`${eve}T00:00:00Z`) + ((h - BRT_OFFSET_H) * 60 + m) * 60_000) // 22:00 BRT = 01:00 UTC do dia seguinte
  let start: Date
  if (type === 'diaria') start = new Date(end.getTime() - 86_400_000)
  else if (type === 'semanal') start = new Date(end.getTime() - 7 * 86_400_000)
  else {
    const ref = new Date(`${referenceDate}T00:00:00Z`)
    const prevMonthFirst = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - 1, 1))
    start = new Date(end.getTime() - (Date.parse(`${referenceDate}T00:00:00Z`) - prevMonthFirst.getTime()))
  }
  return { start: start.toISOString(), end: end.toISOString() }
}

export const DEFAULT_ITEMS_PER_BLOCK: Record<EditionType, Record<BlockKey, number>> = {
  diaria: { estado: 5, nacional: 6, internacional: 4 },
  semanal: { estado: 8, nacional: 10, internacional: 6 },
  mensal: { estado: 10, nacional: 14, internacional: 8 },
}

export type EditionCandidate = Candidate & { analysis_id: string; last_seen_at: string; source_count: number }

/**
 * Escolhe os assuntos da edição: analisados (análise válida), elegíveis pela política de verificação,
 * sem revisão pendente, vistos dentro da janela; os mais relevantes de cada bloco.
 * Diária: aceita assuntos vistos até 12h antes do início (fatos da madrugada anterior que seguem relevantes).
 */
export function selectEditionItems(
  cands: EditionCandidate[],
  p: SelectionPolicy & { state: string; window: { start: string; end: string }; perBlock: Record<BlockKey, number>; graceHours?: number },
): Record<BlockKey, EditionCandidate[]> {
  const start = Date.parse(p.window.start) - (p.graceHours ?? 0) * 3_600_000
  const end = Date.parse(p.window.end)
  const ok = cands
    .filter((c) => eligible(c, p))
    .filter((c) => {
      const t = Date.parse(c.last_seen_at)
      return t >= start && t <= end
    })
    .sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0) || b.source_count - a.source_count)
  return {
    estado: ok.filter((c) => c.scope === 'estadual' && c.state === p.state).slice(0, p.perBlock.estado),
    nacional: ok.filter((c) => c.scope === 'nacional').slice(0, p.perBlock.nacional),
    internacional: ok.filter((c) => c.scope === 'internacional').slice(0, p.perBlock.internacional),
  }
}

/** Caminho do PDF base no bucket privado "documents". */
export const basePdfPath = (type: EditionType, state: string, referenceDate: string, version: number) => `base/${type}/${state}/${referenceDate}/v${version}.pdf`
