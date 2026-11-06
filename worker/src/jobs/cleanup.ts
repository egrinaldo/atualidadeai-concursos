import { loadSettings } from './compose.ts'
import type { JobContext } from './types.ts'

const BUCKET = 'documents'
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

/**
 * Limpeza diária (depois da publicação):
 * - cópias personalizadas com mais de `delivery.personalized_days` (7) dias: arquivo apagado, registro da
 *   entrega mantido (sem o caminho);
 * - PDFs base com mais de `delivery.base_days` (90) dias: arquivo apagado, documento marcado "deleted";
 * - pastas personalizadas de contas excluídas;
 * - retenção do banco (apply_retention: logs, eventos, notícias antigas…).
 */
export async function cleanupJob(_job: { id: string; payload: Record<string, unknown> }, ctx: JobContext) {
  const get = await loadSettings(ctx)
  const personalDays = Math.max(1, Number(get('delivery.personalized_days', 7)))
  const baseDays = Math.max(30, Number(get('delivery.base_days', 90)))
  const stats = { personalized_removed: 0, base_removed: 0, orphan_removed: 0, retention: 'ok' as string }

  // 1. Cópias personalizadas vencidas
  for (;;) {
    const { data, error } = await ctx.db.from('document_deliveries').select('id, personalized_path').not('personalized_path', 'is', null).lt('created_at', daysAgo(personalDays)).limit(500)
    if (error) throw new Error(`entregas antigas: ${error.message}`)
    if (!data?.length) break
    const paths = [...new Set(data.map((d) => d.personalized_path as string))]
    for (let i = 0; i < paths.length; i += 100) {
      const { error: e1 } = await ctx.db.storage.from(BUCKET).remove(paths.slice(i, i + 100))
      if (e1) throw new Error(`apagar cópias: ${e1.message}`)
    }
    const { error: e2 } = await ctx.db.from('document_deliveries').update({ personalized_path: null, updated_at: new Date().toISOString() }).in('id', data.map((d) => d.id))
    if (e2) throw new Error(`atualizar entregas: ${e2.message}`)
    stats.personalized_removed += paths.length
    if (data.length < 500) break
  }

  // 2. PDFs base vencidos
  const { data: old, error: e3 } = await ctx.db.from('generated_documents').select('id, storage_path').neq('status', 'deleted').lt('created_at', daysAgo(baseDays)).limit(500)
  if (e3) throw new Error(`documentos antigos: ${e3.message}`)
  if (old?.length) {
    for (let i = 0; i < old.length; i += 100) {
      const { error } = await ctx.db.storage.from(BUCKET).remove(old.slice(i, i + 100).map((d) => d.storage_path))
      if (error) throw new Error(`apagar PDFs base: ${error.message}`)
    }
    await ctx.db.from('generated_documents').update({ status: 'deleted' }).in('id', old.map((d) => d.id))
    stats.base_removed = old.length
  }

  // 3. Pastas de contas que não existem mais (exclusão de conta pelo titular)
  const { data: folders } = await ctx.db.storage.from(BUCKET).list('personalizados', { limit: 1000 })
  const userIds = (folders ?? []).map((f) => f.name).filter((n) => /^[0-9a-f-]{36}$/.test(n))
  if (userIds.length) {
    const { data: alive } = await ctx.db.from('profiles').select('id').in('id', userIds)
    const aliveSet = new Set((alive ?? []).map((p) => p.id))
    for (const uid of userIds.filter((u) => !aliveSet.has(u))) {
      const { data: files } = await ctx.db.storage.from(BUCKET).list(`personalizados/${uid}`, { limit: 1000 })
      const paths = (files ?? []).map((f) => `personalizados/${uid}/${f.name}`)
      if (paths.length) await ctx.db.storage.from(BUCKET).remove(paths)
      stats.orphan_removed += paths.length
    }
  }

  // 4. Retenção do banco
  const { error: e4 } = await ctx.db.rpc('apply_retention')
  if (e4) stats.retention = `falhou: ${e4.message}`
  ctx.log.info('limpeza', stats)
  return stats
}
