import type { BlockKey } from '../pdf/model.ts'
import { cosine, documentFrequency, tokens, vectorize } from '../triage/text.ts'

/**
 * Revisões semanal e mensal montadas a partir das edições anteriores (hierarquia):
 *   semanal = itens das 7 edições diárias da semana; mensal = itens das revisões semanais do mês
 *   (+ diárias que nenhuma semanal cobriu). O mesmo assunto em dias diferentes vira UMA "história";
 *   história de um só texto reaproveita esse texto; com vários, ganha uma síntese com linha do tempo.
 */

export type EntryKind = 'analise' | 'sintese_semanal' | 'sintese_mensal'

/** Um texto que já saiu numa edição anterior (análise diária ou síntese semanal). */
export type Entry = {
  analysisId: string
  kind: EntryKind
  clusterIds: string[]
  block: BlockKey
  dates: string[] // datas de referência das edições DIÁRIAS em que o fato apareceu (AAAA-MM-DD)
  score: number // relevância do assunto (0–100)
  sourceCount: number
  title: string
  summary: string
  whatHappened: string
  memorize: string[]
  confirmed: string[]
  references: { url: string; source: string | null; title?: string | null; official: boolean }[]
  auditStatus: string
  generatedAt: string
}

export type Story = { block: BlockKey; entries: Entry[]; clusterIds: string[]; dates: string[]; score: number }

/** Junta entradas repetidas (o mesmo texto em várias edições diárias) somando as datas. */
export function dedupeEntries(entries: Entry[]): Entry[] {
  const by = new Map<string, Entry>()
  for (const e of entries) {
    const prev = by.get(e.analysisId)
    if (!prev) by.set(e.analysisId, { ...e, dates: [...new Set(e.dates)].sort() })
    else prev.dates = [...new Set([...prev.dates, ...e.dates])].sort()
  }
  return [...by.values()]
}

/**
 * Agrupa em histórias: mesmo assunto (algum cluster em comum) ou textos muito parecidos (TF-IDF de título+resumo,
 * só dentro do mesmo bloco). Ex.: "Câmara abre impeachment de Peña" (seg) + "Peña renuncia" (qui) = uma história.
 */
export function groupStories(input: Entry[], threshold = 0.4): Story[] {
  const entries = dedupeEntries(input)
  const parent = entries.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb)
  }
  const byCluster = new Map<string, number>()
  entries.forEach((e, i) => {
    for (const c of e.clusterIds) {
      const j = byCluster.get(c)
      if (j === undefined) byCluster.set(c, i)
      else union(i, j)
    }
  })
  const docs = entries.map((e) => tokens(`${e.title} ${e.summary}`))
  const df = documentFrequency(docs)
  const vecs = entries.map((e) => vectorize(e.title, e.summary, df, entries.length))
  for (let i = 0; i < entries.length; i++)
    for (let j = i + 1; j < entries.length; j++)
      if (entries[i].block === entries[j].block && find(i) !== find(j) && cosine(vecs[i], vecs[j]) >= threshold) union(i, j)

  const groups = new Map<number, Entry[]>()
  entries.forEach((e, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), e]))
  return [...groups.values()].map((es) => {
    const sorted = [...es].sort((a, b) => (a.dates[0] ?? '').localeCompare(b.dates[0] ?? '') || a.generatedAt.localeCompare(b.generatedAt))
    const best = [...es].sort((a, b) => b.score - a.score)[0]
    const dates = [...new Set(es.flatMap((e) => e.dates))].sort()
    return { block: best.block, entries: sorted, clusterIds: [...new Set(es.flatMap((e) => e.clusterIds))], dates, score: storyScore(es, dates.length) }
  })
}

/** Relevância da história: o assunto mais relevante + presença em vários dias + mais de um texto. */
export function storyScore(entries: Entry[], days: number): number {
  const best = Math.max(...entries.map((e) => e.score))
  const sources = Math.max(...entries.map((e) => e.sourceCount))
  return best + Math.min(24, 6 * (days - 1)) + Math.min(6, 3 * (entries.length - 1)) + Math.min(5, sources - 1)
}

/** As histórias de maior peso de cada bloco (ordem: peso, depois a mais recente). */
export function selectStories(stories: Story[], perBlock: Record<BlockKey, number>): Record<BlockKey, Story[]> {
  const out: Record<BlockKey, Story[]> = { estado: [], nacional: [], internacional: [] }
  const sorted = [...stories].sort((a, b) => b.score - a.score || (b.dates.at(-1) ?? '').localeCompare(a.dates.at(-1) ?? ''))
  for (const s of sorted) if (out[s.block].length < (perBlock[s.block] ?? 0)) out[s.block].push(s)
  return out
}

/** Data AAAA-MM-DD somada de n dias. */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Período coberto, em datas de referência de edições diárias (a diária do dia D traz os fatos de D−1). */
export function coverage(type: 'semanal' | 'mensal', referenceDate: string): { from: string; to: string } {
  if (type === 'semanal') return { from: addDays(referenceDate, -6), to: referenceDate }
  // Mensal publicada no dia 1: fatos do mês anterior = diárias do dia 2 do mês anterior até o dia 1 atual
  const d = new Date(`${referenceDate}T12:00:00Z`)
  const prevMonthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1, 12)).toISOString().slice(0, 10)
  return { from: addDays(prevMonthStart, 1), to: referenceDate }
}

/** Datas (de diárias) cobertas por uma revisão semanal de referência W: W−6 … W. */
export const weekDates = (w: string) => Array.from({ length: 7 }, (_, i) => addDays(w, i - 6))

/** "06/11" a partir de "2026-11-06". */
export const dayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`
