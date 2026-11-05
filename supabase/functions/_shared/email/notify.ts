import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { errorMessage } from '../http.ts'
import { getEmailProvider } from './provider.ts'
import { renderTransactional, type EmailData, type TransactionalKind } from './templates.ts'

/**
 * Envia um e-mail transacional ao usuário, de forma IDEMPOTENTE:
 * cada `dedupeKey` gera no máximo um e-mail (tabela email_log), mesmo que o
 * mesmo evento do Mercado Pago seja processado várias vezes.
 * Falhas de envio nunca interrompem o processamento do pagamento.
 */

const MAX_ATTEMPTS = 3

export async function notifyUser(
  admin: SupabaseClient,
  input: { userId: string | null | undefined; kind: TransactionalKind; dedupeKey: string; data?: Partial<EmailData> },
): Promise<'sent' | 'skipped' | 'failed'> {
  try {
    if (!input.userId) return 'skipped'
    const { data: profile } = await admin.from('profiles').select('email, full_name').eq('id', input.userId).maybeSingle()
    if (!profile?.email) return 'skipped'

    // Reserva o envio (chave única). Se já existe, só reenvia em caso de falha anterior.
    const { data: existing } = await admin.from('email_log').select('id, status, attempts').eq('dedupe_key', input.dedupeKey).maybeSingle()
    let logId: string
    let attempts = 1
    if (existing) {
      if (existing.status !== 'failed' || existing.attempts >= MAX_ATTEMPTS) return 'skipped'
      attempts = existing.attempts + 1
      logId = existing.id
      await admin.from('email_log').update({ status: 'sending', attempts, error: null }).eq('id', logId)
    } else {
      const { data: inserted, error } = await admin
        .from('email_log')
        .insert({ user_id: input.userId, kind: input.kind, dedupe_key: input.dedupeKey, to_email: profile.email, status: 'sending' })
        .select('id')
        .single()
      if (error || !inserted) return 'skipped' // outra execução reservou primeiro (conflito de chave)
      logId = inserted.id
    }

    const rendered = renderTransactional(input.kind, {
      name: profile.full_name,
      siteUrl: Deno.env.get('SITE_URL') ?? 'http://localhost:5173',
      ...input.data,
    })

    try {
      const provider = getEmailProvider()
      const result = await provider.send({
        to: profile.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        idempotencyKey: input.dedupeKey,
        tags: { kind: input.kind },
      })
      await admin
        .from('email_log')
        .update({
          status: 'sent',
          subject: rendered.subject,
          provider: result.provider,
          provider_message_id: result.id,
          delivered_to: result.deliveredTo,
          sent_at: new Date().toISOString(),
        })
        .eq('id', logId)
      return 'sent'
    } catch (e) {
      await admin.from('email_log').update({ status: 'failed', subject: rendered.subject, error: errorMessage(e) }).eq('id', logId)
      console.error('[email]', input.kind, errorMessage(e))
      return 'failed'
    }
  } catch (e) {
    console.error('[email] erro inesperado', errorMessage(e))
    return 'failed'
  }
}

/** Status de pagamento do Mercado Pago → e-mail correspondente (ou nenhum). */
export function emailForPaymentStatus(status: string): TransactionalKind | null {
  if (status === 'approved') return 'pagamento_aprovado'
  if (status === 'pending' || status === 'in_process' || status === 'authorized') return 'pagamento_pendente'
  if (status === 'rejected') return 'pagamento_recusado'
  return null
}
