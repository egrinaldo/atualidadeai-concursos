import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadConfig } from '../src/config.ts'
import { createLogger, redact } from '../src/lib/logger.ts'
import { backoffMs, HttpError, isRetryable, withRetry } from '../src/lib/retry.ts'

test('logger remove segredos por nome de campo e por padrão de valor', () => {
  const lines: string[] = []
  const log = createLogger('debug', {}, (l) => lines.push(l))
  log.info('chamada', { apiKey: 'qualquer', url: 'https://x', erro: 'falhou com nvapi-ABCDEFGH1234567 e sb_secret_abcdefghijk' })
  const out = lines.join('')
  assert.ok(!out.includes('qualquer'))
  assert.ok(!out.includes('nvapi-ABCDEFGH1234567'))
  assert.ok(!out.includes('sb_secret_abcdefghijk'))
  assert.ok(out.includes('[redigido]'))
  assert.deepEqual(redact({ Authorization: 'Bearer x' }), { Authorization: '[redigido]' })
})

test('logger respeita o nível mínimo', () => {
  const lines: string[] = []
  const log = createLogger('warn', {}, (l) => lines.push(l))
  log.info('ignorado')
  log.warn('registrado')
  assert.equal(lines.length, 1)
})

test('backoff exponencial com teto e jitter', () => {
  assert.equal(backoffMs(1, 1000, 30000, () => 1), 1000)
  assert.equal(backoffMs(3, 1000, 30000, () => 1), 4000)
  assert.equal(backoffMs(10, 1000, 30000, () => 1), 30000)
  assert.equal(backoffMs(3, 1000, 30000, () => 0), 2000)
})

test('erros que merecem nova tentativa', () => {
  assert.equal(isRetryable(new HttpError(429, 'x')), true)
  assert.equal(isRetryable(new HttpError(503, 'x')), true)
  assert.equal(isRetryable(new HttpError(404, 'x')), false)
  assert.equal(isRetryable(new HttpError(401, 'x')), false)
  const t = new Error('t'); t.name = 'TimeoutError'
  assert.equal(isRetryable(t), true)
})

test('withRetry repete só erros temporários e respeita o limite', async () => {
  let calls = 0
  const ok = await withRetry(async () => { calls++; if (calls < 3) throw new HttpError(503, 'x'); return 'ok' }, { retries: 3, sleep: async () => {} })
  assert.equal(ok, 'ok'); assert.equal(calls, 3)
  calls = 0
  await assert.rejects(withRetry(async () => { calls++; throw new HttpError(404, 'x') }, { retries: 3, sleep: async () => {} }))
  assert.equal(calls, 1)
  calls = 0
  await assert.rejects(withRetry(async () => { calls++; throw new HttpError(500, 'x') }, { retries: 2, sleep: async () => {} }))
  assert.equal(calls, 3)
})

test('configuração: erro lista só nomes, nunca valores', () => {
  assert.throws(() => loadConfig({ SUPABASE_URL: 'http://inseguro', SUPABASE_SECRET_KEY: 'curta' }), (e: Error) => {
    assert.match(e.message, /SUPABASE_URL/)
    assert.match(e.message, /SUPABASE_SECRET_KEY/)
    assert.ok(!e.message.includes('curta'))
    return true
  })
  const c = loadConfig({ SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(40), GITHUB_RUN_ID: '42' })
  assert.equal(c.workerId, 'gha-42')
  assert.equal(c.NVIDIA_BASE_URL, 'https://integrate.api.nvidia.com/v1')
  assert.throws(() => loadConfig({ SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'x'.repeat(40), NVIDIA_API_KEY: 'sem-prefixo' }), /NVIDIA_API_KEY/)
})
