import { renderEditionEmail } from '../../../supabase/functions/_shared/email/templates.ts'
import { sendEmail, type Attachment } from '../delivery/email.ts'
import { currentDocument } from '../delivery/recipients.ts'
import { brtDate } from '../pdf/edition.ts'
import { EDITION_LABELS, STATE_NAMES, type EditionType } from '../pdf/model.ts'
import { loadSettings } from './compose.ts'
import type { JobContext } from './types.ts'

const MAX_ATTACH_BYTES = 15 * 1024 * 1024 // acima disso o e-mail vai só com o link da área
const MAX_EMAIL_ATTEMPTS = 3

/** Minutos que faltam para as 06h de hoje (Brasília); negativo depois das 06h. */
function minutesToSix(now = new Date()) {
  const brt = new Date(now.getTime() - 3 * 3_600_000)
  const six = Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 6) + 3 * 3_600_000
  return (six - now.getTime()) / 60_000
}

/** Espera até 06h (Brasília) se o agendamento disparar alguns minutos antes. */
async function waitUntilSix(now = new Date(), sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))) {
  const brt = new Date(now.getTime() - 3 * 3_600_000)
  const six = Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 6) + 3 * 3_600_000
  const wait = six - now.getTime()
  if (wait > 0 && wait <= 10 * 60_000) await sleep(wait)
}

/**
 * Publicação das 06h: edições do dia com PDF aprovado no QA viram "publicadas"; as cópias personalizadas
 * aparecem na área do assinante; com `delivery.email_enabled`, cada assinante recebe UM e-mail com os PDFs
 * do dia em anexo (falhas são tentadas de novo nas próximas execuções, até 3 vezes).
 * Payload opcional: { referenceDate, noWait, emailOnly }. stage "reforco": rodada de segurança a cada coleta (3h):
 * idempotente — só publica/envia o que ainda não saiu (cobre um disparo das 06h perdido ou descartado).
 */
export async function deliverJob(job: { id: string; payload: Record<string, unknown> }, ctx: JobContext, deps?: { fetch?: typeof fetch }) {
  // Nunca publica antes das 06h. Também roda logo após a geração dos PDFs ("deliver@atrasado"): se o agendador
  // do GitHub atrasar e o PDF ficar pronto depois das 06h, a publicação sai na hora, sem esperar o dia seguinte.
  if (job.payload.noWait !== true) {
    if (minutesToSix() > 10) return { skipped: 'antes das 06h — a publicação fica para o horário das 06h', noop: true }
    await waitUntilSix()
  }
  const referenceDate = typeof job.payload.referenceDate === 'string' ? job.payload.referenceDate : brtDate(new Date())
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) throw new Error(`data inválida: ${referenceDate}`)
  const get = await loadSettings(ctx)
  const emailOn = get<boolean>('delivery.email_enabled', false) === true
  const now = new Date().toISOString()

  const { data: eds, error } = await ctx.db.from('editions').select('id, edition_type, state, status').eq('reference_date', referenceDate).in('status', ['generated', 'published'])
  if (error) throw new Error(`edições: ${error.message}`)
  const { count: pending } = await ctx.db.from('editions').select('id', { count: 'exact', head: true }).eq('reference_date', referenceDate).not('status', 'in', '(generated,published)')
  const stats = { referenceDate, published: 0, not_ready: pending ?? 0, area: 0, email: { enabled: emailOn, sent: 0, failed: 0, skipped: 0 } }
  const docs: { id: string; type: EditionType; state: string }[] = []

  for (const ed of eds ?? []) {
    const doc = await currentDocument(ctx, ed.id)
    if (!doc) continue
    docs.push({ id: doc.id, type: ed.edition_type, state: ed.state })
    if (job.payload.emailOnly === true) continue
    if (ed.status !== 'published') {
      await ctx.db.from('generated_documents').update({ status: 'published' }).eq('id', doc.id)
      await ctx.db.from('generated_documents').update({ status: 'superseded' }).eq('edition_id', ed.id).neq('id', doc.id).in('status', ['generated', 'approved', 'published'])
      await ctx.db.from('editions').update({ status: 'published', published_at: now }).eq('id', ed.id)
      stats.published++
    }
    const { data: area } = await ctx.db.from('document_deliveries').update({ status: 'sent', sent_at: now, updated_at: now }).eq('document_id', doc.id).eq('channel', 'area').eq('status', 'prepared').select('id')
    stats.area += area?.length ?? 0
  }

  if (emailOn && docs.length) {
    if (!ctx.config.RESEND_API_KEY) ctx.log.warn('e-mail ligado, mas RESEND_API_KEY ausente — nada enviado')
    else await sendEmails(ctx, referenceDate, docs, stats.email, deps?.fetch)
  }
  // Sem nada publicado/entregue/enviado: a rodada não "ocupa a vaga" do dia (ver lib/slot.ts)
  const noop = stats.published === 0 && stats.area === 0 && stats.email.sent === 0 && stats.email.failed === 0 && docs.length === 0
  ctx.log.info('publicação', { ...stats, noop })
  return { ...stats, noop }
}

type DocInfo = { id: string; type: EditionType; state: string }
type Area = { user_id: string; document_id: string; personalized_path: string | null; status: string }
type Mail = { id: string; user_id: string; document_id: string; status: string; attempts: number }

async function sendEmails(ctx: JobContext, referenceDate: string, docs: DocInfo[], out: { sent: number; failed: number; skipped: number }, fetchImpl?: typeof fetch) {
  const docIds = docs.map((d) => d.id)
  const { data: areaRows, error } = await ctx.db.from('document_deliveries').select('user_id, document_id, personalized_path, status').in('document_id', docIds).eq('channel', 'area').in('status', ['prepared', 'sent'])
  if (error) throw new Error(`entregas: ${error.message}`)
  const area = (areaRows ?? []) as Area[]
  // Registra o canal e-mail para quem tem cópia pronta (idempotente)
  const { data: existing } = await ctx.db.from('document_deliveries').select('id, user_id, document_id, status, attempts').in('document_id', docIds).eq('channel', 'email')
  const have = new Set((existing ?? []).map((e) => `${e.document_id}:${e.user_id}`))
  const missing = area.filter((a) => a.personalized_path && !have.has(`${a.document_id}:${a.user_id}`)).map((a) => ({ document_id: a.document_id, user_id: a.user_id, channel: 'email', personalized_path: a.personalized_path, status: 'prepared' }))
  if (missing.length) {
    const { error: e1 } = await ctx.db.from('document_deliveries').upsert(missing, { onConflict: 'document_id,user_id,channel', ignoreDuplicates: true })
    if (e1) throw new Error(`registrar e-mails: ${e1.message}`)
  }
  const { data: mails } = await ctx.db.from('document_deliveries').select('id, user_id, document_id, status, attempts').in('document_id', docIds).eq('channel', 'email').in('status', ['prepared', 'failed']).lt('attempts', MAX_EMAIL_ATTEMPTS)
  const byUser = new Map<string, Mail[]>()
  for (const m of (mails ?? []) as Mail[]) byUser.set(m.user_id, [...(byUser.get(m.user_id) ?? []), m])
  if (!byUser.size) return

  const { data: profiles } = await ctx.db.from('profiles').select('id, full_name, email, state').in('id', [...byUser.keys()])
  const pathOf = new Map(area.map((a) => [`${a.document_id}:${a.user_id}`, a.personalized_path]))
  const order: Record<EditionType, number> = { diaria: 0, semanal: 1, mensal: 2 }
  const dateLabel = `${referenceDate.slice(8, 10)}/${referenceDate.slice(5, 7)}`

  for (const p of profiles ?? []) {
    const list = (byUser.get(p.id) ?? []).sort((a, b) => order[docs.find((d) => d.id === a.document_id)!.type] - order[docs.find((d) => d.id === b.document_id)!.type])
    try {
      if (!p.email) throw new Error('assinante sem e-mail')
      const files: Attachment[] = []
      let size = 0
      for (const m of list) {
        const d = docs.find((x) => x.id === m.document_id)!
        const path = pathOf.get(`${m.document_id}:${m.user_id}`)
        if (!path) continue
        const { data: f } = await ctx.db.storage.from('documents').download(path)
        if (!f) continue
        const bytes = new Uint8Array(await f.arrayBuffer())
        size += bytes.length
        files.push({ filename: `informativo-${d.type}-${d.state}-${referenceDate}.pdf`, content: bytes })
      }
      const attach = files.length > 0 && size <= MAX_ATTACH_BYTES
      const items = list.map((m) => {
        const d = docs.find((x) => x.id === m.document_id)!
        return `${EDITION_LABELS[d.type]} — ${STATE_NAMES[d.state] ?? d.state}`
      })
      const mail = renderEditionEmail({ name: p.full_name, siteUrl: ctx.config.SITE_URL, dateLabel, stateName: STATE_NAMES[p.state ?? ''] ?? p.state ?? '', items, attached: attach })
      const dedupe = `informativo:${referenceDate}:${p.id}`
      const r = await sendEmail(
        { apiKey: ctx.config.RESEND_API_KEY!, from: ctx.config.EMAIL_FROM, replyTo: ctx.config.EMAIL_REPLY_TO, testTo: ctx.config.EMAIL_TEST_TO },
        { to: p.email, subject: mail.subject, html: mail.html, text: mail.text, idempotencyKey: dedupe, attachments: attach ? files : undefined, tags: { kind: 'informativo' } },
        fetchImpl,
      )
      const sentAt = new Date().toISOString()
      for (const m of list) await ctx.db.from('document_deliveries').update({ status: 'sent', sent_at: sentAt, attempts: m.attempts + 1, error: null, updated_at: sentAt }).eq('id', m.id)
      // Registro do e-mail (aparece na exportação de dados do titular)
      await ctx.db.from('email_log').upsert({ user_id: p.id, kind: 'informativo', dedupe_key: dedupe, to_email: p.email, status: 'sent', subject: mail.subject, provider: 'resend', provider_message_id: r.id, delivered_to: r.deliveredTo, sent_at: sentAt }, { onConflict: 'dedupe_key' })
      out.sent++
    } catch (e) {
      out.failed++
      const msg = (e as Error).message.slice(0, 1000)
      ctx.log.warn('e-mail do informativo falhou', { user: p.id, error: msg })
      for (const m of list) await ctx.db.from('document_deliveries').update({ status: 'failed', attempts: m.attempts + 1, error: msg, updated_at: new Date().toISOString() }).eq('id', m.id)
    }
  }
}

export const _test = { waitUntilSix, minutesToSix }
