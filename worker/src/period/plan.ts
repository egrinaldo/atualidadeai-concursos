import type { JobContext } from '../jobs/types.ts'
import type { BlockKey } from '../pdf/model.ts'
import { coverage, groupStories, weekDates, type Entry, type EntryKind, type Story } from './stories.ts'
import { synthesisHash, type SynthesisKind } from './synthesis.ts'

/** Edições que de fato seguiram adiante (retidas/falhas ficam de fora). */
const USABLE = ['in_review', 'approved', 'generating', 'generated', 'published']
const AUDIT_OK = ['aprovada', 'dispensada', 'pendente'] // pendente: auditada antes do PDF; reprovada/erro ficam fora

type Row = {
  block: BlockKey
  editions: { reference_date: string }
  news_analyses: {
    id: string
    kind: EntryKind
    status: string
    cluster_id: string
    editorial_title: string
    summary: string
    what_happened: string
    memorize: string[]
    consequences: { confirmados?: string[] } | null
    references: Entry['references']
    audit_status: string
    generated_at: string
    period_meta: { cluster_ids?: string[]; dates?: string[] } | null
    news_clusters: { relevance_score: number | null; source_count: number }
  }
}

const COLS = 'block, editions!inner(reference_date), news_analyses!inner(id, kind, status, cluster_id, editorial_title, summary, what_happened, memorize, consequences, references, audit_status, generated_at, period_meta, news_clusters!inner(relevance_score, source_count))'

function toEntry(r: Row, dates: string[]): Entry {
  const a = r.news_analyses
  return {
    analysisId: a.id,
    kind: a.kind,
    clusterIds: a.period_meta?.cluster_ids?.length ? a.period_meta.cluster_ids : [a.cluster_id],
    block: r.block,
    dates,
    score: a.news_clusters.relevance_score ?? 0,
    sourceCount: a.news_clusters.source_count,
    title: a.editorial_title,
    summary: a.summary,
    whatHappened: a.what_happened,
    memorize: a.memorize ?? [],
    confirmed: a.consequences?.confirmados ?? [],
    references: a.references ?? [],
    auditStatus: a.audit_status,
    generatedAt: a.generated_at,
  }
}

/** Itens das edições de um tipo/UF num intervalo de datas de referência. Versões substituídas → versão atual. */
async function editionRows(ctx: JobContext, type: 'diaria' | 'semanal', state: string, from: string, to: string): Promise<Row[]> {
  const { data, error } = await ctx.db
    .from('edition_items')
    .select(COLS)
    .eq('editions.edition_type', type)
    .eq('editions.state', state)
    .in('editions.status', USABLE)
    .gte('editions.reference_date', from)
    .lte('editions.reference_date', to)
    .limit(1000)
  if (error) throw new Error(`itens das edições ${type}: ${error.message}`)
  const rows = (data ?? []) as unknown as Row[]
  // Texto editado/corrigido depois que a edição saiu: usa a versão atual do mesmo assunto
  const stale = rows.filter((r) => !['valid', 'edited'].includes(r.news_analyses.status) && r.news_analyses.kind === 'analise')
  if (stale.length) {
    const { data: cur, error: e2 } = await ctx.db
      .from('news_analyses')
      .select('id, kind, status, cluster_id, editorial_title, summary, what_happened, memorize, consequences, references, audit_status, generated_at, period_meta, news_clusters!inner(relevance_score, source_count)')
      .in('cluster_id', [...new Set(stale.map((r) => r.news_analyses.cluster_id))])
      .eq('kind', 'analise')
      .in('status', ['valid', 'edited'])
      .order('generated_at', { ascending: false })
    if (e2) throw new Error(`versões atuais: ${e2.message}`)
    const latest = new Map<string, Row['news_analyses']>()
    for (const a of (cur ?? []) as unknown as Row['news_analyses'][]) if (!latest.has(a.cluster_id)) latest.set(a.cluster_id, a)
    for (const r of stale) {
      const l = latest.get(r.news_analyses.cluster_id)
      if (l) r.news_analyses = l
    }
  }
  return rows.filter((r) => ['valid', 'edited'].includes(r.news_analyses.status))
}

/**
 * Entradas da revisão: semanal = diárias de W−6 a W; mensal = semanais do mês + diárias não cobertas por elas.
 * Cada entrada traz as datas (de diárias) em que o fato apareceu, para a linha do tempo e o peso da história.
 */
export async function periodEntries(ctx: JobContext, type: 'semanal' | 'mensal', state: string, referenceDate: string): Promise<{ entries: Entry[]; from: string; to: string; weeklies: string[] }> {
  const { from, to } = coverage(type, referenceDate)
  if (type === 'semanal') {
    const rows = await editionRows(ctx, 'diaria', state, from, to)
    return { entries: rows.map((r) => toEntry(r, [r.editions.reference_date])), from, to, weeklies: [] }
  }
  const [weekly, daily] = await Promise.all([editionRows(ctx, 'semanal', state, from, to), editionRows(ctx, 'diaria', state, from, to)])
  const inRange = (d: string) => d >= from && d <= to
  const dailyDates = new Map<string, string[]>()
  for (const r of daily) dailyDates.set(r.news_analyses.id, [...(dailyDates.get(r.news_analyses.id) ?? []), r.editions.reference_date])
  const weeklies = [...new Set(weekly.map((r) => r.editions.reference_date))].sort()
  const covered = new Set(weeklies.flatMap(weekDates))
  const entries: Entry[] = []
  for (const r of weekly) {
    const dates = (r.news_analyses.period_meta?.dates ?? dailyDates.get(r.news_analyses.id) ?? weekDates(r.editions.reference_date).slice(-1)).filter(inRange)
    if (dates.length) entries.push(toEntry(r, dates))
  }
  for (const r of daily) if (!covered.has(r.editions.reference_date)) entries.push(toEntry(r, [r.editions.reference_date]))
  return { entries, from, to, weeklies }
}

export type PlannedItem = { story: Story; block: BlockKey; position: number; reuse: string | null; hash: string | null }

/** Histórias do período (ainda sem escolher as de cada bloco). Entradas reprovadas na auditoria não entram. */
export async function periodStories(ctx: JobContext, type: 'semanal' | 'mensal', state: string, referenceDate: string, threshold: number) {
  const { entries, from, to, weeklies } = await periodEntries(ctx, type, state, referenceDate)
  const ok = entries.filter((e) => AUDIT_OK.includes(e.auditStatus))
  return { stories: groupStories(ok, threshold), entries: ok.length, dropped: entries.length - ok.length, from, to, weeklies }
}

/** História de um texto só reaproveita esse texto; com vários, precisa de síntese (identificada pelo hash). */
export function planStory(story: Story, kind: SynthesisKind): { reuse: string | null; hash: string | null } {
  return story.entries.length === 1 ? { reuse: story.entries[0].analysisId, hash: null } : { reuse: null, hash: synthesisHash(kind, story) }
}

export const synthesisKindFor = (type: 'semanal' | 'mensal'): SynthesisKind => (type === 'semanal' ? 'sintese_semanal' : 'sintese_mensal')
