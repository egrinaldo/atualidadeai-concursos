import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { renderEditionEmail } from '../../supabase/functions/_shared/email/templates.ts'
import { applyTestRedirect, sendEmail } from '../src/delivery/email.ts'
import { deliveryCode, personalizedPath } from '../src/delivery/recipients.ts'
import { _test } from '../src/jobs/deliver.ts'
import { personalizePdf, printable } from '../src/pdf/personalize.ts'

async function basePdf(pages = 3) {
  const pdf = await PDFDocument.create()
  for (let i = 0; i < pages; i++) pdf.addPage([595.28, 841.89])
  pdf.setTitle('Informativo Diário — Ceará')
  return pdf.save()
}

test('personalização: carimba nome/e-mail sem mudar o número de páginas e grava o código da entrega', async () => {
  const out = await personalizePdf(await basePdf(3), { name: 'Maria da Conceição Ñuñez', email: 'maria@exemplo.com', code: 'abc123def456' })
  const pdf = await PDFDocument.load(out)
  assert.equal(pdf.getPageCount(), 3)
  assert.equal(pdf.getTitle(), 'Informativo Diário — Ceará') // título do base preservado
  assert.match(pdf.getSubject() ?? '', /exclusivo de Maria da Conceição Ñuñez <maria@exemplo\.com>/)
  assert.match(pdf.getKeywords() ?? '', /entrega:abc123def456/)
  assert.ok(out.length > 1000)
})

test('personalização: caracteres fora da fonte padrão são aproximados, acentos do português ficam', async () => {
  const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica)
  assert.equal(printable('João Ação', font), 'João Ação')
  assert.ok(!/[Łłę]/.test(printable('Łukasz Wałęsa', font)))
  assert.equal(printable('Ana\u0000\u0007 Lima', font), 'Ana Lima')
  // Nome muito longo não quebra
  await personalizePdf(await basePdf(1), { name: 'Nome '.repeat(80), email: `${'x'.repeat(60)}@exemplo.com`, code: 'x' })
})

test('entrega: caminho da cópia sem dados pessoais e código estável', () => {
  const p = personalizedPath('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')
  assert.equal(p, 'personalizados/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.pdf')
  assert.equal(deliveryCode('a', 'b'), deliveryCode('a', 'b'))
  assert.notEqual(deliveryCode('a', 'b'), deliveryCode('a', 'c'))
  assert.match(deliveryCode('a', 'b'), /^[a-f0-9]{12}$/)
})

test('e-mail: modo de teste redireciona tudo e marca o assunto; envio leva anexo, idempotência e remetente', async () => {
  const e = { to: 'aluno@exemplo.com', subject: 'Seu informativo', html: '<p>x</p>', text: 'x', idempotencyKey: 'informativo:2026-11-07:u1' }
  assert.equal(applyTestRedirect(e, 'teste@exemplo.com').to, 'teste@exemplo.com')
  assert.match(applyTestRedirect(e, 'teste@exemplo.com').subject, /^\[TESTE → aluno@exemplo\.com\]/)
  assert.equal(applyTestRedirect(e).to, 'aluno@exemplo.com')
  let sent: { headers: Record<string, string>; body: Record<string, unknown> } | null = null
  const fake = (async (_url: string, init: RequestInit) => {
    sent = { headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) }
    return new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 })
  }) as unknown as typeof fetch
  const r = await sendEmail({ apiKey: 're_x', testTo: 'teste@exemplo.com', from: 'AtualidadeAI <a@b.com>' }, { ...e, attachments: [{ filename: 'a.pdf', content: new Uint8Array([37, 80, 68, 70]) }] }, fake)
  assert.deepEqual(r, { id: 'msg_1', deliveredTo: 'teste@exemplo.com' })
  assert.equal(sent!.headers['Idempotency-Key'], 'informativo:2026-11-07:u1')
  assert.deepEqual(sent!.body.to, ['teste@exemplo.com'])
  assert.equal((sent!.body.attachments as { content: string }[])[0].content, 'JVBERg==')
  const fail = (async () => new Response(JSON.stringify({ message: 'invalid' }), { status: 422 })) as unknown as typeof fetch
  await assert.rejects(sendEmail({ apiKey: 're_x' }, e, fail), /Resend 422/)
})

test('e-mail do informativo: assunto com data e estado, lista dos materiais e link da área', () => {
  const m = renderEditionEmail({ name: 'Maria Souza', siteUrl: 'https://site.com/', dateLabel: '09/11', stateName: 'Ceará', items: ['Informativo Diário — Ceará', 'Revisão Semanal — Ceará'], attached: true })
  assert.equal(m.subject, 'Seu informativo de 09/11 — Ceará')
  assert.match(m.html, /Olá, Maria!/)
  assert.match(m.html, /https:\/\/site\.com\/conta/)
  assert.match(m.text, /- Revisão Semanal — Ceará/)
  assert.match(m.text, /em anexo/)
  const x = renderEditionEmail({ name: '<script>', siteUrl: 'https://site.com', dateLabel: '07/11', stateName: 'Ceará', items: ['Informativo Diário — Ceará'], attached: false })
  assert.doesNotMatch(x.html, /<script>/)
  assert.doesNotMatch(x.text, /anexo/)
})

test('publicação: espera dar 06h se disparar até 10 min antes; fora disso não espera', async () => {
  const waits: number[] = []
  const sleep = async (ms: number) => void waits.push(ms)
  await _test.waitUntilSix(new Date('2026-11-07T08:57:00Z'), sleep) // 05h57 em Brasília
  assert.deepEqual(waits, [3 * 60_000])
  await _test.waitUntilSix(new Date('2026-11-07T09:05:00Z'), sleep) // 06h05
  await _test.waitUntilSix(new Date('2026-11-07T07:35:00Z'), sleep) // 04h35
  assert.equal(waits.length, 1)
})
