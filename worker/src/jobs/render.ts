import { createHash } from 'node:crypto'
import { basePdfPath, brtDate } from '../pdf/edition.ts'
import { buildDoc, TEMPLATE_VERSION, type BlockKey, type EditionType, type SourceRow } from '../pdf/model.ts'
import { qaEdition } from '../pdf/qa.ts'
import { renderEditionPdf } from '../pdf/render.ts'
import type { JobContext } from './types.ts'

type Edition = { id: string; edition_type: EditionType; state: string; reference_date: string; period_start: string; period_end: string; current_version: number; status: string; summary?: { updates?: Record<string, string> } | null }
type ItemRow = {
  block: BlockKey
  position: number
  news_analyses: Omit<SourceRow, 'category' | 'verification_status' | 'source_count' | 'refs'> & {
    id: string
    references: SourceRow['refs']
    news_clusters: { category: string | null; verification_status: string | null; source_count: number }
  }
}

const ANALYSIS_COLS =
  'id, audit_status, period_meta, editorial_title, summary, what_happened, context, historical_background, political_analysis, economic_analysis, social_impact, why_it_matters, consequences, relevance_for_exams, possible_exam_topics, memorize, exam_approaches, questions, references, news_clusters!inner(category, verification_status, source_count)'

/**
 * Geração dos PDFs base (um por edição/UF, sem dados de assinante): monta o documento, renderiza (Playwright),
 * passa pelo controle de qualidade, envia ao bucket privado "documents" e registra em generated_documents.
 * Pega as edições da data (padrão: hoje em Brasília) que estão em revisão ou aprovadas — no horário-limite
 * da revisão (04h30) a edição em revisão é aprovada automaticamente (modo editorial padrão).
 * Itens sem auditoria de veracidade aprovada ficam fora (e o QA reprova se algum escapar).
 * Payload opcional: { referenceDate, editionId }.
 */
export async function renderJob(job: { payload: Record<string, unknown> }, ctx: JobContext) {
  const referenceDate = typeof job.payload.referenceDate === 'string' ? job.payload.referenceDate : brtDate(new Date())
  let q = ctx.db.from('editions').select('id, edition_type, state, reference_date, period_start, period_end, current_version, status, summary').in('status', ['in_review', 'approved'])
  q = typeof job.payload.editionId === 'string' ? q.eq('id', job.payload.editionId) : q.eq('reference_date', referenceDate)
  const { data: editions, error } = await q
  if (error) throw new Error(`edições: ${error.message}`)
  if (!editions?.length) return { referenceDate, rendered: 0 }

  const { chromium } = await import('playwright')
  const browser = await chromium.launch()
  const results: Record<string, unknown>[] = []
  try {
    for (const ed of editions as Edition[]) {
      await ctx.db.from('editions').update({ status: 'generating' }).eq('id', ed.id)
      try {
        const { data: items, error: e1 } = await ctx.db.from('edition_items').select(`block, position, news_analyses!inner(${ANALYSIS_COLS})`).eq('edition_id', ed.id).order('position')
        if (e1) throw new Error(`itens: ${e1.message}`)
        const byBlock: Record<BlockKey, SourceRow[]> = { estado: [], nacional: [], internacional: [] }
        // Auditoria de veracidade: só texto aprovado (ou dispensado pelo editor, com registro) entra no PDF
        const excluded: string[] = []
        for (const it of (items ?? []) as unknown as ItemRow[]) {
          const a = it.news_analyses
          if (a.audit_status !== 'aprovada' && a.audit_status !== 'dispensada') {
            excluded.push(`${a.editorial_title} (${a.audit_status})`)
            continue
          }
          byBlock[it.block].push({ ...a, update_of: ed.summary?.updates?.[a.id] ?? null, refs: a.references, category: a.news_clusters.category, verification_status: a.news_clusters.verification_status, source_count: a.news_clusters.source_count })
        }
        const doc = buildDoc({ type: ed.edition_type, state: ed.state, referenceDate: ed.reference_date, periodStart: ed.period_start, periodEnd: ed.period_end }, byBlock)
        const out = await renderEditionPdf(doc, { browser: browser as never })
        const qa = await qaEdition(doc, out.html, out.bytes)
        if (excluded.length) qa.warnings.push(...excluded.map((t) => `fora do PDF pela auditoria de veracidade: ${t}`))
        const version = ed.current_version + 1
        const path = basePdfPath(ed.edition_type, ed.state, ed.reference_date, version)
        const checksum = createHash('sha256').update(out.bytes).digest('hex')
        if (qa.passed) {
          const { error: e2 } = await ctx.db.storage.from('documents').upload(path, out.bytes, { contentType: 'application/pdf', upsert: false })
          if (e2) throw new Error(`armazenamento: ${e2.message}`)
        }
        await ctx.db.from('generated_documents').update({ status: 'superseded' }).eq('edition_id', ed.id).in('status', ['generated', 'approved'])
        const { error: e3 } = await ctx.db.from('generated_documents').insert({
          edition_id: ed.id, version, storage_path: qa.passed ? path : `qa-reprovado/${path}`, template_version: TEMPLATE_VERSION,
          file_size: out.bytes.length, page_count: out.pageCount, checksum, qa_status: qa.passed ? 'passed' : 'failed', qa_report: qa,
          status: qa.passed ? 'generated' : 'deleted',
        })
        if (e3) throw new Error(`registro do documento: ${e3.message}`)
        await ctx.db.from('editions').update({ status: qa.passed ? 'generated' : 'failed', current_version: version }).eq('id', ed.id)
        results.push({ edition: ed.id, type: ed.edition_type, state: ed.state, version, pages: out.pageCount, kb: Math.round(out.bytes.length / 1024), excluded_by_audit: excluded.length, qa: qa.passed ? 'ok' : qa.errors })
        ctx.log.info('PDF gerado', { edition: ed.id, type: ed.edition_type, state: ed.state, version, pages: out.pageCount, qa: qa.passed })
      } catch (e) {
        await ctx.db.from('editions').update({ status: 'failed' }).eq('id', ed.id)
        results.push({ edition: ed.id, error: (e as Error).message })
        ctx.log.error('falha ao gerar PDF', { edition: ed.id, error: (e as Error).message })
      }
    }
  } finally {
    await browser.close()
  }
  // Falha não relança a tarefa (a edição fica "failed" para o painel decidir: corrigir e gerar de novo)
  const failed = results.filter((r) => r.error || Array.isArray(r.qa)).length
  if (failed) ctx.log.error('edições com falha na geração', { failed })
  return { referenceDate, rendered: results.length - failed, failed, results }
}
