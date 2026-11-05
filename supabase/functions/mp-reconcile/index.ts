/**
 * POST /functions/v1/mp-reconcile   (chamado pelo agendamento pg_cron)
 *
 * Rede de segurança caso uma notificação do Mercado Pago se perca:
 * consulta na API todas as assinaturas em andamento e atualiza o banco
 * (renovações, cobranças recusadas, cancelamentos feitos no Mercado Pago).
 * Protegido pelo cabeçalho x-cron-secret (segredo CRON_SECRET).
 */
import { adminClient, logEvent } from '../_shared/db.ts'
import { errorMessage, json } from '../_shared/http.ts'
import { timingSafeEqualHex } from '../_shared/signature.ts'
import { fullSync } from '../_shared/sync.ts'

const MAX_PER_RUN = 200

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  const expected = Deno.env.get('CRON_SECRET') ?? ''
  const received = req.headers.get('x-cron-secret') ?? ''
  if (!expected || !timingSafeEqualHex(received, expected)) return json({ error: 'unauthorized' }, 401)

  const admin = adminClient()
  const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString()
  const { data: subs, error } = await admin
    .from('subscriptions')
    .select('id, status, external_subscription_id, created_at')
    .not('external_subscription_id', 'is', null)
    .or(`status.in.(active,paused),and(status.eq.pending,created_at.gte.${since})`)
    .order('created_at', { ascending: true })
    .limit(MAX_PER_RUN)
  if (error) return json({ error: error.message }, 500)

  let ok = 0
  let failed = 0
  for (const s of subs ?? []) {
    try {
      await fullSync(admin, s.external_subscription_id as string)
      ok++
    } catch (e) {
      failed++
      console.error('[mp-reconcile]', s.id, errorMessage(e))
    }
  }
  await logEvent(admin, {
    source: 'sync',
    topic: 'reconcile',
    status: failed ? 'failed' : 'processed',
    error: failed ? `${failed} falha(s)` : null,
    payload: { checked: subs?.length ?? 0, ok, failed },
  })
  return json({ checked: subs?.length ?? 0, ok, failed })
})
