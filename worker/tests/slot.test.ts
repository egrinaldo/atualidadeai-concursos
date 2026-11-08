import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isNoop, tickSlot } from '../src/lib/slot.ts'

test('vaga: publicação usa a data de hoje; montagem usa a próxima edição', () => {
  // 07/11 12:14 (Brasília) = 15:14 UTC — o disparo atrasado que ocupou a vaga de 08/11
  const late = new Date('2026-11-07T15:14:00Z')
  assert.equal(tickSlot('edition', 'deliver', late), 'ed-2026-11-07')
  assert.equal(tickSlot('edition', 'healthcheck', late), 'ed-2026-11-07')
  assert.equal(tickSlot('edition', 'compose', late), 'ed-2026-11-08')
  // 08/11 05:57 (Brasília) — o disparo das 06h
  const six = new Date('2026-11-08T08:57:00Z')
  assert.equal(tickSlot('edition', 'deliver', six), 'ed-2026-11-08')
  assert.equal(tickSlot('edition', 'render', new Date('2026-11-08T07:35:00Z')), 'ed-2026-11-08')
  // 22h12 de 07/11: montagem da edição de 08/11
  assert.equal(tickSlot('edition', 'compose', new Date('2026-11-08T01:12:00Z')), 'ed-2026-11-08')
  assert.match(tickSlot('manual', 'deliver', six), /^m-/)
  assert.equal(tickSlot(undefined, 'collect', six), '2026-11-08T06')
})

test('rodada sem efeito não ocupa a vaga', () => {
  assert.equal(isNoop({ status: 'succeeded', result: { noop: true } }), true)
  assert.equal(isNoop({ status: 'succeeded', result: { skipped: 'antes das 06h', noop: true } }), true)
  assert.equal(isNoop({ status: 'succeeded', result: { published: 1, noop: false } }), false)
  assert.equal(isNoop({ status: 'succeeded', result: { published: 0 } }), false) // rodadas antigas: sem a marca
  assert.equal(isNoop({ status: 'running', result: null }), false)
  assert.equal(isNoop(null), false)
})
