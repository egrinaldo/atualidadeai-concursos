/**
 * Configura o envio de e-mails do Supabase Auth (cadastro e recuperação de
 * senha) para usar o Resend via SMTP, com os modelos em português, e ajusta
 * Site URL / Redirect URLs.
 *
 * Uso:   npm run auth:email            (aplica)
 *        npm run auth:email -- --dry   (só mostra o que seria alterado)
 *
 * Lê do .env: SUPABASE_ACCESS_TOKEN, VITE_SUPABASE_URL, RESEND_API_KEY,
 * e opcionais EMAIL_FROM, SITE_URLS (lista separada por vírgula).
 */
import { renderAuthTemplates } from '../supabase/functions/_shared/email/templates.ts'

async function loadDotEnv(path: string) {
  try {
    for (const line of (await Deno.readTextFile(path)).split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
      if (m && !Deno.env.get(m[1]!)) Deno.env.set(m[1]!, m[2]!.trim().replace(/^["']|["']$/g, ''))
    }
  } catch {
    /* ausente */
  }
}
await loadDotEnv('.env')
await loadDotEnv('.env.local')

const dry = Deno.args.includes('--dry')
const pat = Deno.env.get('SUPABASE_ACCESS_TOKEN')
const resendKey = Deno.env.get('RESEND_API_KEY')
const ref = (Deno.env.get('VITE_SUPABASE_URL') ?? '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
if (!pat || !resendKey || !ref) {
  console.error('Defina SUPABASE_ACCESS_TOKEN, RESEND_API_KEY e VITE_SUPABASE_URL no .env')
  Deno.exit(1)
}

// Remetente: sem domínio próprio, o Resend só permite onboarding@resend.dev
const from = Deno.env.get('EMAIL_FROM') || 'AtualidadeAI Concursos <onboarding@resend.dev>'
const fromMatch = from.match(/^(.*)<(.+)>$/)
const senderName = (fromMatch?.[1] ?? 'AtualidadeAI Concursos').trim()
const senderEmail = (fromMatch?.[2] ?? from).trim()

const sites = (Deno.env.get('SITE_URLS') ?? 'https://atualidadeai-concursos.vercel.app,http://localhost:5173')
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''))
  .filter(Boolean)
// Segurança (auditoria V01): endereços exatos apenas. Um curinga como
// "projeto-*.vercel.app" casa com domínios que qualquer pessoa pode criar.
for (const s of sites) {
  if (s.includes('*') || !/^https:\/\/[a-z0-9.-]+$|^http:\/\/localhost(:\d+)?$/.test(s)) {
    console.error(`Endereço não permitido em SITE_URLS: ${s} (use https exato, sem curinga)`)
    Deno.exit(1)
  }
}
const t = renderAuthTemplates()

const patch = {
  external_email_enabled: true,
  mailer_autoconfirm: false, // mantém a confirmação de e-mail obrigatória
  site_url: sites[0],
  uri_allow_list: sites.map((s) => `${s}/**`).join(','),
  smtp_host: 'smtp.resend.com',
  smtp_port: '465',
  smtp_user: 'resend',
  smtp_pass: resendKey,
  smtp_admin_email: senderEmail,
  smtp_sender_name: senderName,
  smtp_max_frequency: 30, // segundos mínimos entre e-mails para o mesmo usuário
  rate_limit_email_sent: 60, // e-mails de autenticação por hora (limite do projeto)
  password_min_length: 8, // igual à regra do site (auditoria V10)
  security_update_password_require_reauthentication: true, // troca de senha exige login recente
  mailer_subjects_confirmation: t.confirmation.subject,
  mailer_templates_confirmation_content: t.confirmation.html,
  mailer_subjects_recovery: t.recovery.subject,
  mailer_templates_recovery_content: t.recovery.html,
}

const api = `https://api.supabase.com/v1/projects/${ref}/config/auth`
const headers = { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' }

const before = await (await fetch(api, { headers })).json()
console.log('Atual:', JSON.stringify({ site_url: before.site_url, uri_allow_list: before.uri_allow_list, smtp_host: before.smtp_host ?? null, mailer_autoconfirm: before.mailer_autoconfirm, rate_limit_email_sent: before.rate_limit_email_sent }))
console.log('Novo: ', JSON.stringify({ site_url: patch.site_url, uri_allow_list: patch.uri_allow_list, smtp_host: patch.smtp_host, remetente: from, rate_limit_email_sent: patch.rate_limit_email_sent }))

if (dry) Deno.exit(0)
const res = await fetch(api, { method: 'PATCH', headers, body: JSON.stringify(patch) })
const body = await res.json().catch(() => ({}))
if (!res.ok) {
  console.error('Falha:', res.status, body?.message ?? JSON.stringify(body).slice(0, 300))
  Deno.exit(1)
}
console.log('✓ Supabase Auth configurado: SMTP Resend, modelos em português, Site URL e Redirect URLs.')
