import { selectAll } from '../db/paginate.ts'
import { decideReview, type ReviewAction } from '../review/decide.ts'
import { loadSettings } from './compose.ts'
import type { JobContext } from './types.ts'

type Row = {
  id: string
  status: string
  verification_status: string | null
  news_analyses: { id: string; kind: string; status: string; audit_status: string; audit_report: { attempts?: number } | null; validation_errors: { erros?: string[] } | null; generated_at: string }[]
}

/**
 * Revisão automática (robô): resolve a fila "precisa de revisão" com as regras de review/decide.ts.
 * Roda depois da auditoria (a cada 3h) e antes de montar as edições. Payload: { dryRun: true } só calcula.
 */
export async function reviewJob(job: { id: string; payload: Record<string, unknown> }, ctx: JobContext) {
  const get = await loadSettings(ctx)
  if (get<boolean>('review.auto', true) === false) return { skipped: 'revisão automática desligada nas configurações' }
  const maxReanalysis = Number(get('review.max_reanalysis', 1))
  const dryRun = job.payload.dryRun === true

  const rows = (await selectAll((from, to) =>
    ctx.db
      .from('news_clusters')
      .select('id, status, verification_status, news_analyses(id, kind, status, audit_status, audit_report, validation_errors, generated_at)')
      .eq('needs_review', true)
      .not('status', 'in', '(rejected,discarded,published)')
      .order('id')
      .range(from, to),
  )) as unknown as Row[]
  if (!rows.length) return { reviewed: 0 }

  // Quantas novas análises o robô já pediu para cada assunto
  const { data: past, error } = await ctx.db.from('editorial_reviews').select('target_id').is('reviewer_id', null).eq('target_type', 'cluster').eq('action', 'request_reanalysis').in('target_id', rows.map((r) => r.id))
  if (error) throw new Error(`histórico do robô: ${error.message}`)
  const retries = new Map<string, number>()
  for (const p of past ?? []) retries.set(p.target_id, (retries.get(p.target_id) ?? 0) + 1)

  const counts: Record<ReviewAction, number> = { release: 0, approve: 0, reanalyze: 0, discard: 0, wait: 0, human: 0 }
  const decisions: { cluster: string; action: ReviewAction; reason: string }[] = []
  for (const r of rows) {
    const latest = [...(r.news_analyses ?? [])].filter((a) => a.kind === 'analise' && ['valid', 'edited', 'invalid'].includes(a.status)).sort((a, b) => b.generated_at.localeCompare(a.generated_at))[0]
    const d = decideReview(
      {
        verificationStatus: r.verification_status,
        analysis: latest ? { status: latest.status as 'valid' | 'edited' | 'invalid', auditStatus: latest.audit_status, auditAttempts: latest.audit_report?.attempts ?? 0, errors: latest.validation_errors?.erros ?? [] } : null,
        robotReanalyses: retries.get(r.id) ?? 0,
      },
      maxReanalysis,
    )
    counts[d.action]++
    decisions.push({ cluster: r.id, ...d })
    if (dryRun || d.action === 'wait' || d.action === 'human') continue

    if (d.action === 'reanalyze') {
      const { error: e1 } = await ctx.db.from('news_analyses').update({ status: 'superseded' }).eq('cluster_id', r.id).eq('kind', 'analise').in('status', ['valid', 'invalid'])
      if (e1) throw new Error(`reanálise: ${e1.message}`)
      await ctx.db.from('news_clusters').update({ status: 'verified', needs_review: false }).eq('id', r.id)
    } else if (d.action === 'discard') await ctx.db.from('news_clusters').update({ status: 'discarded', needs_review: false }).eq('id', r.id)
    else await ctx.db.from('news_clusters').update({ needs_review: false }).eq('id', r.id)

    const action = d.action === 'reanalyze' ? 'request_reanalysis' : d.action === 'discard' ? 'reject' : 'approve'
    const { error: e2 } = await ctx.db.from('editorial_reviews').insert({ target_type: 'cluster', target_id: r.id, action, reviewer_id: null, notes: `Robô: ${d.reason}`.slice(0, 2000), changes: { automatico: true, decisao: d.action } })
    if (e2) throw new Error(`registrar decisão: ${e2.message}`)
  }
  ctx.log.info('revisão automática', { ...counts, dryRun })
  return { reviewed: rows.length, ...counts, dryRun, decisions: decisions.slice(0, 50) }
}
