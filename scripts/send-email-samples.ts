/**
 * Envia um exemplo de cada e-mail para EMAIL_TEST_TO, usando o Resend.
 * Útil para revisar textos e visual após qualquer alteração nos modelos.
 *
 * Uso:  npm run email:samples
 * Lê RESEND_API_KEY, EMAIL_TEST_TO e (opcional) EMAIL_FROM do arquivo .env.
 */
import { renderAuthTemplates, renderTransactional, type TransactionalKind } from '../supabase/functions/_shared/email/templates.ts'

async function loadDotEnv(path: string) {
  try {
    for (const line of (await Deno.readTextFile(path)).split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
      if (m && !Deno.env.get(m[1]!)) Deno.env.set(m[1]!, m[2]!.trim().replace(/^["']|["']$/g, ''))
    }
  } catch {
    /* arquivo ausente */
  }
}
await loadDotEnv('.env')
await loadDotEnv('.env.local')

const key = Deno.env.get('RESEND_API_KEY')
const to = Deno.env.get('EMAIL_TEST_TO')
const from = Deno.env.get('EMAIL_FROM') || 'AtualidadeAI Concursos <onboarding@resend.dev>'
if (!key || !to) {
  console.error('Defina RESEND_API_KEY e EMAIL_TEST_TO no .env')
  Deno.exit(1)
}

const data = { name: 'Maria Silva', amount: 10, nextPaymentDate: new Date(Date.now() + 30 * 864e5).toISOString(), siteUrl: 'http://localhost:5173' }
const kinds: TransactionalKind[] = ['assinatura_ativada', 'orientacoes_iniciais', 'pagamento_aprovado', 'pagamento_pendente', 'pagamento_recusado']
const auth = renderAuthTemplates()
const samples = [
  ...kinds.map((k) => ({ label: k, ...renderTransactional(k, data) })),
  { label: 'cadastro (Supabase Auth)', subject: auth.confirmation.subject, html: auth.confirmation.html.replaceAll('{{ .ConfirmationURL }}', data.siteUrl + '/confirmar-email'), text: '' },
  { label: 'recuperação (Supabase Auth)', subject: auth.recovery.subject, html: auth.recovery.html.replaceAll('{{ .ConfirmationURL }}', data.siteUrl + '/redefinir-senha'), text: '' },
]

let failed = 0
for (const s of samples) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: `[EXEMPLO] ${s.subject}`, html: s.html, ...(s.text ? { text: s.text } : {}) }),
  })
  const body = await res.json().catch(() => ({}))
  console.log(res.ok ? '  ✓' : '  ✗', s.label.padEnd(28), res.ok ? '' : `${res.status} ${body?.message ?? ''}`)
  if (!res.ok) failed++
  await new Promise((r) => setTimeout(r, 600)) // respeita o limite de 2 req/s do Resend
}
console.log(failed ? `\n${failed} falha(s).` : `\n${samples.length} exemplos enviados para ${to}.`)
Deno.exit(failed ? 1 : 0)
