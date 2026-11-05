/**
 * Provedor de envio de e-mails — ÚNICO ponto acoplado ao serviço externo.
 *
 * Para trocar o Resend por outro serviço (Brevo, SES, Postmark...),
 * implemente `EmailProvider` e ajuste `getEmailProvider()`.
 *
 * Variáveis (Secrets das Edge Functions):
 *   EMAIL_PROVIDER   'resend' (padrão quando há RESEND_API_KEY) | 'log' (só registra, não envia)
 *   RESEND_API_KEY   chave da API do Resend
 *   EMAIL_FROM       remetente, ex.: 'AtualidadeAI Concursos <contato@seudominio.com.br>'
 *   EMAIL_REPLY_TO   (opcional) endereço de resposta
 *   EMAIL_TEST_TO    (opcional, só em teste) redireciona TODOS os envios para este endereço
 */

export type OutgoingEmail = {
  to: string
  subject: string
  html: string
  text: string
  idempotencyKey?: string
  tags?: Record<string, string>
}

export type SendResult = { id: string; provider: string; deliveredTo: string }

export interface EmailProvider {
  readonly name: string
  send(email: OutgoingEmail): Promise<SendResult>
}

const DEFAULT_FROM = 'AtualidadeAI Concursos <onboarding@resend.dev>'

/** Em modo de teste, envia para EMAIL_TEST_TO e indica o destinatário original no assunto. */
function applyTestRedirect(email: OutgoingEmail): OutgoingEmail {
  const testTo = Deno.env.get('EMAIL_TEST_TO')
  if (!testTo || testTo.toLowerCase() === email.to.toLowerCase()) return email
  return { ...email, to: testTo, subject: `[TESTE → ${email.to}] ${email.subject}` }
}

class ResendProvider implements EmailProvider {
  readonly name = 'resend'
  constructor(private apiKey: string) {}

  async send(original: OutgoingEmail): Promise<SendResult> {
    const email = applyTestRedirect(original)
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    }
    if (email.idempotencyKey) headers['Idempotency-Key'] = email.idempotencyKey.slice(0, 256)
    const replyTo = Deno.env.get('EMAIL_REPLY_TO')
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        from: Deno.env.get('EMAIL_FROM') || DEFAULT_FROM,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(replyTo ? { reply_to: replyTo } : {}),
        tags: Object.entries(email.tags ?? {}).map(([name, value]) => ({ name, value: value.replace(/[^\w-]/g, '_') })),
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`Resend ${res.status}: ${body?.message ?? body?.name ?? res.statusText}`)
    return { id: String(body.id), provider: this.name, deliveredTo: email.to }
  }
}

/** Não envia nada: útil em desenvolvimento ou se o provedor estiver indisponível. */
class LogProvider implements EmailProvider {
  readonly name = 'log'
  send(email: OutgoingEmail): Promise<SendResult> {
    console.log(`[email:log] para=${email.to} assunto="${email.subject}"`)
    return Promise.resolve({ id: `log-${crypto.randomUUID()}`, provider: this.name, deliveredTo: email.to })
  }
}

export function getEmailProvider(): EmailProvider {
  const choice = (Deno.env.get('EMAIL_PROVIDER') ?? '').toLowerCase()
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (choice === 'log') return new LogProvider()
  if (resendKey) return new ResendProvider(resendKey)
  return new LogProvider()
}
