/**
 * Testes das regras de pagamento (sem rede).
 * Executar:  npx deno test supabase/functions/tests/
 */
import { amountMatches, billingToMp, firstChargeAmount, introActive, isUuid, mapPaymentStatus, mapPreapprovalStatus, notificationKind, revokesAccess } from '../_shared/mapping.ts'
import { buildManifest, hmacSha256Hex, parseSignatureHeader, verifyMercadoPagoSignature } from '../_shared/signature.ts'

function assertEquals<T>(actual: T, expected: T, msg = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${msg} esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`)
}

const SECRET = 'segredo-de-teste'

async function signed(dataId: string, requestId: string | null, ts = '1742505638683') {
  const v1 = await hmacSha256Hex(SECRET, buildManifest(dataId, requestId, ts))
  return `ts=${ts},v1=${v1}`
}

Deno.test('cabeçalho x-signature é interpretado', () => {
  assertEquals(parseSignatureHeader('ts=1704908010,v1=abc123'), { ts: '1704908010', v1: 'abc123' })
  const h = parseSignatureHeader(' v1=ff , ts=10 ')
  assertEquals([h.ts, h.v1], ['10', 'ff'])
  assertEquals(parseSignatureHeader(null), {})
})

Deno.test('manifesto segue o formato oficial e omite partes ausentes', () => {
  assertEquals(buildManifest('123', 'req-1', '99'), 'id:123;request-id:req-1;ts:99;')
  assertEquals(buildManifest('123', null, '99'), 'id:123;ts:99;')
  assertEquals(buildManifest(null, 'r', '99'), 'request-id:r;ts:99;')
})

Deno.test('HMAC-SHA256 confere com vetor conhecido (RFC 4231, caso 2)', async () => {
  assertEquals(
    await hmacSha256Hex('Jefe', 'what do ya want for nothing?'),
    '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
  )
})

Deno.test('assinatura válida é aceita', async () => {
  const r = await verifyMercadoPagoSignature({ xSignature: await signed('123456', 'req-abc'), xRequestId: 'req-abc', dataId: '123456', secret: SECRET })
  assertEquals(r, { valid: true })
})

Deno.test('assinatura sem x-request-id é aceita', async () => {
  const r = await verifyMercadoPagoSignature({ xSignature: await signed('123', null), xRequestId: null, dataId: '123', secret: SECRET })
  assertEquals(r.valid, true)
})

Deno.test('ID alfanumérico: aceita manifesto em minúsculas ou como recebido', async () => {
  const lower = await verifyMercadoPagoSignature({ xSignature: await signed('2c938084abc', 'r'), xRequestId: 'r', dataId: '2C938084ABC', secret: SECRET })
  const asIs = await verifyMercadoPagoSignature({ xSignature: await signed('2C938084ABC', 'r'), xRequestId: 'r', dataId: '2C938084ABC', secret: SECRET })
  assertEquals([lower.valid, asIs.valid], [true, true])
})

Deno.test('assinatura adulterada, segredo errado, ID trocado e cabeçalho ausente são rejeitados', async () => {
  const sig = await signed('123', 'r')
  const cases = await Promise.all([
    verifyMercadoPagoSignature({ xSignature: sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0'), xRequestId: 'r', dataId: '123', secret: SECRET }),
    verifyMercadoPagoSignature({ xSignature: sig, xRequestId: 'r', dataId: '123', secret: 'outro' }),
    verifyMercadoPagoSignature({ xSignature: sig, xRequestId: 'r', dataId: '999', secret: SECRET }),
    verifyMercadoPagoSignature({ xSignature: sig, xRequestId: 'outro', dataId: '123', secret: SECRET }),
    verifyMercadoPagoSignature({ xSignature: null, xRequestId: 'r', dataId: '123', secret: SECRET }),
    verifyMercadoPagoSignature({ xSignature: sig, xRequestId: 'r', dataId: '123', secret: '' }),
  ])
  assertEquals(cases.map((c) => (c.valid ? 'ok' : c.reason)), [
    'signature_mismatch', 'signature_mismatch', 'signature_mismatch', 'signature_mismatch', 'missing_signature_header', 'secret_not_configured',
  ])
})

Deno.test('status da assinatura do Mercado Pago → status local', () => {
  assertEquals(['authorized', 'pending', 'paused', 'cancelled', 'finished', 'xyz', null].map(mapPreapprovalStatus), [
    'active', 'pending', 'paused', 'cancelled', 'expired', 'pending', 'pending',
  ])
})

Deno.test('status de pagamento: conhecidos mantidos, desconhecidos viram pending', () => {
  assertEquals(['approved', 'rejected', 'refunded', 'charged_back', 'APPROVED', 'novo'].map(mapPaymentStatus), [
    'approved', 'rejected', 'refunded', 'charged_back', 'approved', 'pending',
  ])
})

Deno.test('tipos de notificação (formato novo e legado)', () => {
  assertEquals(
    ['subscription_preapproval', 'preapproval', 'subscription_authorized_payment', 'payment', 'merchant_order'].map(notificationKind),
    ['preapproval', 'preapproval', 'authorized_payment', 'payment', 'other'],
  )
})

Deno.test('valor e moeda precisam bater com o plano para ativar', () => {
  const plan = { price: '10.00', currency: 'BRL' }
  assertEquals(amountMatches({ transaction_amount: 10, currency_id: 'BRL' }, plan), true)
  assertEquals(amountMatches({ transaction_amount: 9.99, currency_id: 'BRL' }, plan), false)
  assertEquals(amountMatches({ transaction_amount: 10, currency_id: 'USD' }, plan), false)
  assertEquals(amountMatches(null, plan), false)
})

Deno.test('frequência e UUID', () => {
  assertEquals(billingToMp('monthly'), { frequency: 1, frequency_type: 'months' })
  assertEquals(isUuid('c0ffee00-0000-4000-8000-000000000001'), true)
  assertEquals(isUuid('YG-1234'), false)
})

Deno.test('estorno e contestação encerram o acesso; demais status não', () => {
  assertEquals(revokesAccess('refunded'), true)
  assertEquals(revokesAccess('charged_back'), true)
  for (const st of ['approved', 'pending', 'rejected', 'cancelled', 'in_mediation'] as const) assertEquals(revokesAccess(st), false, st)
})

Deno.test('promoção do 1º mês (Black Friday): vale até intro_until, exclusivo', () => {
  const plan = { price: 29.9, intro_price: 9.9, intro_until: '2026-11-30T03:00:00Z' }
  assertEquals(introActive(plan, new Date('2026-11-29T23:59:00-03:00')), true)
  assertEquals(firstChargeAmount(plan, new Date('2026-11-29T23:59:00-03:00')), 9.9)
  assertEquals(introActive(plan, new Date('2026-11-30T00:00:00-03:00')), false)
  assertEquals(firstChargeAmount(plan, new Date('2026-11-30T00:00:00-03:00')), 29.9)
  assertEquals(introActive({ price: 29.9, intro_price: null, intro_until: null }), false)
  assertEquals(introActive({ price: 9.9, intro_price: 19.9, intro_until: '2099-01-01T00:00:00Z' }), false) // "promoção" mais cara: ignora
})
