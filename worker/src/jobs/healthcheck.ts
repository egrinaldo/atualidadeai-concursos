import type { JobContext } from './types.ts'

/**
 * Verifica a infraestrutura da Etapa 2 sem efeitos colaterais:
 * banco (tabelas e configurações), bucket privado e configuração da IA.
 * Não chama a NVIDIA (economiza créditos) — só confere se a chave existe.
 */
export async function healthcheck(_job: unknown, ctx: JobContext) {
  const checks: Record<string, unknown> = {}

  const cats = await ctx.db.from('news_categories').select('code', { count: 'exact', head: true })
  checks.categorias = cats.error ? `erro: ${cats.error.message}` : cats.count

  const settings = await ctx.db.from('app_settings').select('key, value').in('key', ['pipeline.pilot_states', 'pipeline.publish_time'])
  checks.configuracoes = settings.error ? `erro: ${settings.error.message}` : Object.fromEntries((settings.data ?? []).map((s) => [s.key, s.value]))

  const bucket = await ctx.db.storage.getBucket('documents')
  checks.bucket_documents = bucket.error ? `erro: ${bucket.error.message}` : { privado: bucket.data.public === false }

  checks.ia = { provedor: 'nvidia', chave_configurada: Boolean(ctx.config.NVIDIA_API_KEY), modelo: ctx.config.NVIDIA_MODEL ?? '(a definir na 2.5)' }

  const failed = Object.values(checks).some((v) => typeof v === 'string' && v.startsWith('erro'))
  if (failed) throw new Error(`healthcheck falhou: ${JSON.stringify(checks)}`)
  return checks
}
