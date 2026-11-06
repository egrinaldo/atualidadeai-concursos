/**
 * Envio pelo Resend a partir do worker (mesmas regras do provedor das Edge Functions):
 * EMAIL_TEST_TO redireciona TODOS os envios (assunto ganha "[TESTE → destinatário]"); idempotência pela
 * chave da entrega (o Resend ignora repetição da mesma chave por 24h).
 */
export type Attachment = { filename: string; content: Uint8Array }
export type OutgoingEmail = { to: string; subject: string; html: string; text: string; idempotencyKey: string; attachments?: Attachment[]; tags?: Record<string, string> }
export type EmailConfig = { apiKey: string; from?: string; replyTo?: string; testTo?: string }

const DEFAULT_FROM = 'AtualidadeAI Concursos <onboarding@resend.dev>'

export function applyTestRedirect(email: OutgoingEmail, testTo?: string): OutgoingEmail {
  if (!testTo || testTo.toLowerCase() === email.to.toLowerCase()) return email
  return { ...email, to: testTo, subject: `[TESTE → ${email.to}] ${email.subject}` }
}

export async function sendEmail(cfg: EmailConfig, original: OutgoingEmail, fetchImpl: typeof fetch = fetch): Promise<{ id: string; deliveredTo: string }> {
  const email = applyTestRedirect(original, cfg.testTo)
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': email.idempotencyKey.slice(0, 256) },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      from: cfg.from || DEFAULT_FROM,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(cfg.replyTo ? { reply_to: cfg.replyTo } : {}),
      ...(email.attachments?.length ? { attachments: email.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString('base64') })) } : {}),
      tags: Object.entries(email.tags ?? {}).map(([name, value]) => ({ name, value: value.replace(/[^\w-]/g, '_') })),
    }),
  })
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string }
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body?.message ?? body?.name ?? res.statusText}`)
  return { id: String(body.id), deliveredTo: email.to }
}
