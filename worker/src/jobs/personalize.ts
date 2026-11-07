import { activeSubscribers, currentDocument, deliveryCode, personalizedPath } from '../delivery/recipients.ts'
import { brtDate } from '../pdf/edition.ts'
import { personalizePdf } from '../pdf/personalize.ts'
import { loadSettings } from './compose.ts'
import type { JobContext } from './types.ts'

/**
 * Cópias personalizadas (nome + e-mail) das edições do dia para cada assinante ativo da UF da edição.
 * Roda logo depois da geração dos PDFs base (04h35); a publicação é às 06h (deliver). Idempotente: cópia já
 * preparada para o mesmo documento não é refeita. Payload opcional: { referenceDate, userIds }.
 */
export async function personalizeJob(job: { id: string; payload: Record<string, unknown> }, ctx: JobContext) {
  const referenceDate = typeof job.payload.referenceDate === 'string' ? job.payload.referenceDate : brtDate(new Date())
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) throw new Error(`data inválida: ${referenceDate}`)

  const { data: eds, error } = await ctx.db.from('editions').select('id, edition_type, state, status').eq('reference_date', referenceDate).in('status', ['generated', 'published'])
  if (error) throw new Error(`edições: ${error.message}`)
  const get = await loadSettings(ctx)
  let subs = await activeSubscribers(ctx, { includeAdmins: get<boolean>('delivery.include_admins', true) !== false })
  if (Array.isArray(job.payload.userIds)) subs = subs.filter((s) => (job.payload.userIds as string[]).includes(s.id))
  const stats = { referenceDate, editions: eds?.length ?? 0, subscribers: subs.length, without_state: subs.filter((s) => !s.state).length, prepared: 0, already: 0, failed: 0 }

  for (const ed of eds ?? []) {
    const doc = await currentDocument(ctx, ed.id)
    if (!doc) {
      ctx.log.warn('personalização: edição sem PDF aprovado no QA', { edition: ed.id })
      continue
    }
    const recipients = subs.filter((s) => s.state === ed.state)
    if (!recipients.length) continue
    const { data: done } = await ctx.db.from('document_deliveries').select('user_id, channel, status, personalized_path').eq('document_id', doc.id).in('user_id', recipients.map((r) => r.id))
    const ready = new Set((done ?? []).filter((d) => d.channel === 'area' && d.personalized_path && d.status !== 'failed').map((d) => d.user_id))
    const todo = recipients.filter((r) => !ready.has(r.id))
    stats.already += recipients.length - todo.length
    if (!todo.length) continue

    const { data: file, error: e1 } = await ctx.db.storage.from('documents').download(doc.storage_path)
    if (e1 || !file) throw new Error(`baixar PDF base: ${e1?.message}`)
    const base = new Uint8Array(await file.arrayBuffer())
    for (const r of todo) {
      const path = personalizedPath(r.id, doc.id)
      try {
        const bytes = await personalizePdf(base, { name: r.name, email: r.email, code: deliveryCode(doc.id, r.id) })
        const { error: e2 } = await ctx.db.storage.from('documents').upload(path, bytes, { contentType: 'application/pdf', upsert: true })
        if (e2) throw new Error(`enviar cópia: ${e2.message}`)
        // Canal "área" (o e-mail é registrado na publicação, se estiver ligado)
        const row = { document_id: doc.id, user_id: r.id, channel: 'area', personalized_path: path, status: 'prepared', error: null, updated_at: new Date().toISOString() }
        const { error: e3 } = await ctx.db.from('document_deliveries').upsert(row, { onConflict: 'document_id,user_id,channel' })
        if (e3) throw new Error(`registrar entrega: ${e3.message}`)
        stats.prepared++
      } catch (e) {
        stats.failed++
        ctx.log.warn('personalização falhou', { edition: ed.id, user: r.id, error: (e as Error).message })
        await ctx.db.from('document_deliveries').upsert({ document_id: doc.id, user_id: r.id, channel: 'area', status: 'failed', error: (e as Error).message.slice(0, 1000) }, { onConflict: 'document_id,user_id,channel' })
      }
    }
  }
  ctx.log.info('personalização', stats)
  return stats
}
