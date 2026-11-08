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
