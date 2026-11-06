import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decideReview, type ReviewInput } from '../src/review/decide.ts'

const an = (p: Partial<NonNullable<ReviewInput['analysis']>> = {}) => ({ status: 'valid' as const, auditStatus: 'aprovada', auditAttempts: 1, errors: [], ...p })
const d = (i: Partial<ReviewInput>, max = 1) => decideReview({ verificationStatus: 'corroborada', analysis: null, robotReanalyses: 0, ...i }, max)

test('revisão automática: sem análise, o motivo é a verificação — libera a fila (a seleção continua barrando o que não foi confirmado)', () => {
  assert.equal(d({ verificationStatus: 'nao_confirmada' }).action, 'release')
  assert.match(d({ verificationStatus: 'nao_confirmada' }).reason, /fica fora da edição/)
  assert.match(d({ verificationStatus: 'contradita' }).reason, /contradizem/)
  assert.equal(d({ verificationStatus: 'fontes_divergentes' }).action, 'release')
})

test('revisão automática: texto auditado e aprovado (ou dispensado) é liberado', () => {
  assert.equal(d({ analysis: an() }).action, 'approve')
  assert.equal(d({ analysis: an({ auditStatus: 'dispensada', status: 'edited' }) }).action, 'approve')
})

test('revisão automática: espera a auditoria pendente (ou com erro ainda com nova tentativa)', () => {
  assert.equal(d({ analysis: an({ auditStatus: 'pendente' }) }).action, 'wait')
  assert.equal(d({ analysis: an({ auditStatus: 'erro', auditAttempts: 1 }) }).action, 'wait')
})

test('revisão automática: análise inválida ou reprovada ganha UMA nova análise; depois, descarte', () => {
  assert.equal(d({ analysis: an({ status: 'invalid', errors: ['texto sem acentuação'] }) }).action, 'reanalyze')
  assert.equal(d({ analysis: an({ status: 'invalid' }), robotReanalyses: 1 }).action, 'discard')
  assert.equal(d({ analysis: an({ auditStatus: 'reprovada' }) }).action, 'reanalyze')
  assert.equal(d({ analysis: an({ auditStatus: 'reprovada' }), robotReanalyses: 1 }).action, 'discard')
  assert.equal(d({ analysis: an({ auditStatus: 'erro', auditAttempts: 2 }), robotReanalyses: 1 }).action, 'discard')
  assert.equal(d({ analysis: an({ status: 'invalid' }) }, 0).action, 'discard') // configuração 0 = sem novas tentativas
})

test('revisão automática: texto editado por pessoa e reprovado fica com o editor', () => {
  assert.equal(d({ analysis: an({ status: 'edited', auditStatus: 'reprovada' }) }).action, 'human')
})
