import assert from 'node:assert/strict'
import { test } from 'node:test'
import { editionStates } from '../src/jobs/compose.ts'
import { uncoveredStates } from '../src/jobs/healthcheck.ts'
import type { JobContext } from '../src/jobs/types.ts'

/** Banco falso: só o necessário para activeSubscribers (assinaturas, administradores, perfis). */
function fakeCtx(tables: Record<string, Record<string, unknown>[]>): JobContext {
  const query = (rows: Record<string, unknown>[]) => {
    let out = rows
    const b = {
      select: () => b,
      eq: (k: string, v: unknown) => ((out = out.filter((r) => r[k] === v)), b),
      in: (k: string, vs: unknown[]) => ((out = out.filter((r) => vs.includes(r[k]))), b),
      limit: () => b,
      then: (res: (x: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: out, error: null }).then(res),
    }
    return b
  }
  return { db: { from: (t: string) => query(tables[t] ?? []) } } as unknown as JobContext
}

test('todo assinante ativo, de qualquer estado, ganha edição', async () => {
  const ctx = fakeCtx({
    subscriptions: [
      { user_id: 'a', status: 'active' }, { user_id: 'b', status: 'active' },
      { user_id: 'c', status: 'cancelled' }, // cancelado: não conta
    ],
    admins: [{ user_id: 'adm' }],
    profiles: [
      { id: 'a', full_name: 'A', email: 'a@x.com', state: 'SP' }, { id: 'b', full_name: 'B', email: 'b@x.com', state: 'BA' },
      { id: 'c', full_name: 'C', email: 'c@x.com', state: 'RS' }, { id: 'adm', full_name: 'Adm', email: 'adm@x.com', state: 'CE' },
    ],
  })
  assert.deepEqual(await editionStates(ctx, ['CE']), ['BA', 'CE', 'SP'])
})

test('alerta: estado com edição mas sem fontes estaduais', () => {
  // SP tem assinante, mas não tem fontes nem está no piloto; BA tem fontes e está no piloto
  assert.deepEqual(uncoveredStates(['BA', 'CE', 'SP'], ['BA', 'CE'], ['CE', 'BA', 'BA']), ['SP'])
  // fontes cadastradas, mas UF fora do piloto: ainda sem bloco estadual
  assert.deepEqual(uncoveredStates(['RJ'], ['CE'], ['RJ']), ['RJ'])
  assert.deepEqual(uncoveredStates(['CE'], ['CE'], ['CE']), [])
})

test('cota de IA cresce com o número de estados (com teto)', async () => {
  const { scaledBudget } = await import('../src/ai/budget.ts')
  const none = <T>(_k: string, d: T) => d
  assert.deepEqual(scaledBudget(none, 1), { daily: 120, perRun: 6 })
  assert.deepEqual(scaledBudget(none, 3), { daily: 220, perRun: 12 })
  assert.deepEqual(scaledBudget(none, 27), { daily: 600, perRun: 16 })
})

test('análise: nacional e internacional vêm antes das filas estaduais', async () => {
  const { selectForAnalysis } = await import('../src/analysis/select.ts')
  const c = (id: string, scope: 'estadual' | 'nacional' | 'internacional', state: string | null) => ({ id, scope, state, relevance: 'alta' as const, relevance_score: 80, verification_status: 'corroborada', needs_review: false, best_reliability: 5 })
  const out = selectForAnalysis([c('e1', 'estadual', 'BA'), c('e2', 'estadual', 'SE'), c('n1', 'nacional', null), c('i1', 'internacional', null)], { pilotStates: ['BA', 'CE', 'SE'], perBlock: { estado: 5, nacional: 6, internacional: 4 }, minRelevance: 'media', editionStatuses: ['corroborada'], singleSourceMinReliability: 4 })
  assert.deepEqual(out.map((o) => o.id), ['n1', 'i1', 'e1', 'e2'])
})
