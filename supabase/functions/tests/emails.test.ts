/**
 * Testes dos modelos de e-mail (sem rede).
 * Executar:  npx deno test supabase/functions/tests/
 */
import { emailForPaymentStatus } from '../_shared/email/notify.ts'
import { escapeHtml, formatBRL, formatDateBR, renderAuthTemplates, renderTransactional, type TransactionalKind } from '../_shared/email/templates.ts'

function ok(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

const KINDS: TransactionalKind[] = ['assinatura_ativada', 'orientacoes_iniciais', 'pagamento_aprovado', 'pagamento_pendente', 'pagamento_recusado']
const DATA = { name: 'Maria  Silva', amount: 10, nextPaymentDate: '2026-12-04T21:13:05Z', siteUrl: 'https://exemplo.com.br/' }

Deno.test('todos os modelos geram assunto, HTML e texto em português', () => {
  for (const k of KINDS) {
    const r = renderTransactional(k, DATA)
    ok(r.subject.length > 5, `${k}: assunto vazio`)
    ok(r.html.startsWith('<!doctype html>') && r.html.includes('lang="pt-BR"'), `${k}: HTML inválido`)
    ok(r.text.includes('AtualidadeAI Concursos'), `${k}: texto sem assinatura`)
    ok(r.html.includes('Olá, Maria!') && r.text.includes('Olá, Maria!'), `${k}: saudação`)
    ok(r.html.includes('https://exemplo.com.br/conta'), `${k}: link para a conta`)
  }
})

Deno.test('valores e datas em formato brasileiro', () => {
  ok(formatBRL(10) === 'R$ 10,00', 'formatBRL')
  ok(formatDateBR('2026-12-04T21:13:05Z') === '4 de dezembro de 2026', 'formatDateBR')
  const r = renderTransactional('assinatura_ativada', DATA)
  ok(r.html.includes('R$ 10,00') && r.html.includes('4 de dezembro de 2026'), 'valor/data no e-mail de contratação')
  ok(renderTransactional('pagamento_aprovado', DATA).subject === 'Pagamento aprovado — R$ 10,00', 'assunto do pagamento')
})

Deno.test('dados do usuário são escapados (sem injeção de HTML)', () => {
  const r = renderTransactional('pagamento_aprovado', { ...DATA, name: '<script>alert(1)</script>' })
  ok(!r.html.includes('<script>alert'), 'script não escapado')
  ok(escapeHtml('<a href="x">&') === '&lt;a href=&quot;x&quot;&gt;&amp;', 'escapeHtml')
})

Deno.test('boas-vindas personalizada: nome, estado, valor e próxima cobrança', () => {
  const r = renderTransactional('assinatura_ativada', { ...DATA, amount: 9.99, state: 'se' })
  ok(r.subject === 'Bem-vindo(a) ao AtualidadeAI Concursos, Maria!', r.subject)
  ok(r.html.includes('de Sergipe, do Brasil e do mundo') && r.text.includes('Atualidades de Sergipe'), 'estado')
  ok(r.html.includes('R$ 9,99 por mês') && r.html.includes('4 de dezembro de 2026'), 'valor/data')
  const semUf = renderTransactional('assinatura_ativada', { siteUrl: 'https://x.com' })
  ok(semUf.subject === 'Bem-vindo(a) ao AtualidadeAI Concursos!' && semUf.text.includes('Informe o seu estado'), 'sem nome/estado')
})

Deno.test('funciona sem nome, valor ou data', () => {
  const r = renderTransactional('assinatura_ativada', { siteUrl: 'https://x.com' })
  ok(r.html.includes('Olá!') && !r.html.includes('undefined') && !r.html.includes('null'), 'campos ausentes')
})

Deno.test('modelos de autenticação mantêm a variável do Supabase', () => {
  const t = renderAuthTemplates()
  ok(t.confirmation.html.includes('href="{{ .SiteURL }}/confirmar-email?token_hash={{ .TokenHash }}&type=email"'), 'confirmação sem link fixo')
  ok(t.recovery.html.includes('href="{{ .SiteURL }}/redefinir-senha?token_hash={{ .TokenHash }}&type=recovery"'), 'recuperação sem link fixo')
  ok(!t.confirmation.html.includes('ConfirmationURL') && !t.recovery.html.includes('ConfirmationURL'), 'link não pode depender do redirect informado')
  ok(t.confirmation.subject.includes('Confirme'), 'assunto confirmação')
})

Deno.test('status de pagamento → e-mail', () => {
  const m = ['approved', 'pending', 'in_process', 'rejected', 'refunded', 'cancelled'].map(emailForPaymentStatus)
  ok(JSON.stringify(m) === JSON.stringify(['pagamento_aprovado', 'pagamento_pendente', 'pagamento_pendente', 'pagamento_recusado', null, null]), JSON.stringify(m))
})
