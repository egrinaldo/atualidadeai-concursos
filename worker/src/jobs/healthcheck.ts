import { renderOpsAlertEmail } from '../../../supabase/functions/_shared/email/templates.ts'
import { sendEmail } from '../delivery/email.ts'
import { brtDate } from '../pdf/edition.ts'
import { editionStates, loadSettings } from './compose.ts'
import type { JobContext } from './types.ts'

const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString()

/**
 * Sem payload: verificação da infraestrutura (banco, bucket, chave da IA) — sem efeitos colaterais.
 * payload { stage: 'diario' } (depois da publicação das 06h): verificação operacional do dia e, se algo
 * falhou, e-mail de alerta aos administradores (`ops.alert_email`). Nunca envia e-mail quando está tudo certo.
 */
export async function healthcheck(job: { id?: string; payload?: Record<string, unknown> } | unknown, ctx: JobContext) {
  const payload = ((job as { payload?: Record<string, unknown> })?.payload ?? {}) as Record<string, unknown>
  if (payload.stage === 'diario') return dailyReport(ctx, payload)

  const checks: Record<string, unknown> = {}
  const cats = await ctx.db.from('news_categories').select('code', { count: 'exact', head: true })
  checks.categorias = cats.error ? `erro: ${cats.error.message}` : cats.count
  const settings = await ctx.db.from('app_settings').select('key, value').in('key', ['pipeline.pilot_states', 'pipeline.publish_time'])
  checks.configuracoes = settings.error ? `erro: ${settings.error.message}` : Object.fromEntries((settings.data ?? []).map((s) => [s.key, s.value]))
  const bucket = await ctx.db.storage.getBucket('documents')
  checks.bucket_documents = bucket.error ? `erro: ${bucket.error.message}` : { privado: bucket.data.public === false }
  checks.ia = { provedor: 'nvidia', chave_configurada: Boolean(ctx.config.NVIDIA_API_KEY), modelo: ctx.config.NVIDIA_MODEL ?? '(configurações)' }
  const failed = Object.values(checks).some((v) => typeof v === 'string' && v.startsWith('erro'))
  if (failed) throw new Error(`healthcheck falhou: ${JSON.stringify(checks)}`)
  return checks
}

/** Lista de problemas do dia (texto pronto para o e-mail). Exportada para teste. */
export async function collectProblems(ctx: JobContext, today: string): Promise<string[]> {
  const problems: string[] = []
  const get = await loadSettings(ctx)

  // 1. Edições de hoje publicadas?
  const pilot = get<string[]>('pipeline.pilot_states', ['CE'])
  const states = await editionStates(ctx, pilot)
  const { data: eds } = await ctx.db.from('editions').select('edition_type, state, status').eq('reference_date', today)
  for (const st of states) {
    const daily = (eds ?? []).find((e) => e.state === st && e.edition_type === 'diaria')
    if (!daily) problems.push(`Edição diária de ${st} de hoje não foi montada (a montagem das 22h não rodou ou não achou matérias)`)
    else if (daily.status !== 'published') problems.push(`Edição diária de ${st} de hoje está "${daily.status}", não publicada`)
  }
  for (const e of (eds ?? []).filter((x) => x.edition_type !== 'diaria' && x.status !== 'published')) problems.push(`Revisão ${e.edition_type} de ${e.state} está "${e.status}", não publicada`)

  // 1b. Assinantes de estados sem fontes estaduais: recebem só Brasil e Mundo
  const { data: srcs } = await ctx.db.from('news_sources').select('state').eq('is_active', true).eq('scope', 'estadual')
  const withSources = new Set((srcs ?? []).map((r) => r.state as string))
  const uncovered = states.filter((st) => !withSources.has(st) || !pilot.includes(st))
  if (uncovered.length) problems.push(`Assinantes de ${uncovered.join(', ')} recebem o PDF sem o bloco estadual: falta cadastrar fontes estaduais e incluir o estado em pipeline.pilot_states`)

  // 2. Tarefas do robô que falharam nas últimas 24h
  // Só rodadas agendadas (têm dedupe_key); execuções manuais/testes locais não geram alerta
  const { data: jobs } = await ctx.db.from('processing_jobs').select('job_type, status, last_error').in('status', ['failed', 'dead']).gte('created_at', hoursAgo(24)).not('dedupe_key', 'is', null).not('dedupe_key', 'like', 'teste%').limit(50)
  const byType = new Map<string, { n: number; err: string }>()
  for (const j of jobs ?? []) byType.set(j.job_type, { n: (byType.get(j.job_type)?.n ?? 0) + 1, err: j.last_error ?? '' })
  for (const [t, v] of byType) problems.push(`Tarefa "${t}" falhou ${v.n}x nas últimas 24h: ${v.err.slice(0, 160)}`)

  // 3. Coleta: houve rodada recente? fontes quebradas?
  const { data: lastCollect } = await ctx.db.from('processing_jobs').select('created_at').eq('job_type', 'collect').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!lastCollect || lastCollect.created_at < hoursAgo(7)) problems.push(`Nenhuma coleta de notícias nas últimas 7h (última: ${lastCollect?.created_at?.slice(0, 16).replace('T', ' ') ?? 'nunca'} UTC) — agendador parado?`)
  const { count: broken } = await ctx.db.from('news_sources').select('id', { count: 'exact', head: true }).eq('is_active', true).gte('consecutive_failures', 5)
  if ((broken ?? 0) > 0) problems.push(`${broken} fonte(s) ativa(s) com 5+ falhas seguidas (Painel → Fontes)`)

  // 4. Entregas por e-mail que falharam hoje
  const { count: mailFail } = await ctx.db.from('document_deliveries').select('id', { count: 'exact', head: true }).eq('channel', 'email').eq('status', 'failed').gte('updated_at', hoursAgo(24))
  if ((mailFail ?? 0) > 0) problems.push(`${mailFail} e-mail(s) do informativo falharam nas últimas 24h`)

  // 5. Agendador do Supabase: disparos recusados pelo GitHub (204 = aceito)
  const { data: disp, error: dErr } = await ctx.db.rpc('dispatch_recent', { p_hours: 24 })
  if (!dErr) {
    // A resposta do GitHub é copiada para dispatch_log a cada 10 min (o pg_net apaga as respostas após 6h).
    // Sem resposta há mais de 30 min = o pedido não chegou ao GitHub; código ≠ 204 = recusado.
    const rows = (disp ?? []) as { created: string; status_code: number | null; error: string | null }[]
    const refused = rows.filter((d) => d.status_code != null && d.status_code !== 204)
    const lost = rows.filter((d) => d.status_code == null && d.created < new Date(Date.now() - 30 * 60_000).toISOString())
    if (refused.length) problems.push(`Agendador: ${refused.length} disparo(s) recusado(s) pelo GitHub (ex.: HTTP ${refused[0].status_code} ${String(refused[0].error ?? '').slice(0, 100)}) — token vencido ou sem permissão?`)
    if (lost.length) problems.push(`Agendador: ${lost.length} disparo(s) sem resposta do GitHub (falha de rede no Supabase) — confira se o robô rodou em GitHub → Actions`)
  }

  // 6. IA: cota quase no fim ou muitos erros
  const { data: ai } = await ctx.db.from('ai_usage_logs').select('status').gte('created_at', hoursAgo(24))
  const errors = (ai ?? []).filter((r) => r.status === 'error').length
  if ((ai ?? []).length >= 10 && errors / (ai ?? []).length > 0.3) problems.push(`IA: ${errors} de ${(ai ?? []).length} chamadas com erro nas últimas 24h (provedor instável ou chave inválida)`)
  return problems
}

async function dailyReport(ctx: JobContext, payload: Record<string, unknown>) {
  const today = typeof payload.referenceDate === 'string' ? payload.referenceDate : brtDate(new Date())
  const problems = await collectProblems(ctx, today)
  const get = await loadSettings(ctx)
  let alerted = 0
  if (problems.length && get<boolean>('ops.alert_email', true) !== false && ctx.config.RESEND_API_KEY && payload.dryRun !== true) {
    const { data: admins } = await ctx.db.from('admins').select('user_id')
    const { data: people } = await ctx.db.from('profiles').select('email').in('id', (admins ?? []).map((a) => a.user_id))
    const mail = renderOpsAlertEmail({ siteUrl: ctx.config.SITE_URL, dateLabel: `${today.slice(8, 10)}/${today.slice(5, 7)}`, problems })
    for (const p of people ?? []) {
      if (!p.email) continue
      try {
        await sendEmail({ apiKey: ctx.config.RESEND_API_KEY, from: ctx.config.EMAIL_FROM, replyTo: ctx.config.EMAIL_REPLY_TO, testTo: ctx.config.EMAIL_TEST_TO }, { to: p.email, subject: mail.subject, html: mail.html, text: mail.text, idempotencyKey: `alerta:${today}:${p.email}`, tags: { kind: 'alerta' } })
        alerted++
      } catch (e) {
        ctx.log.warn('alerta operacional não enviado', { error: (e as Error).message })
      }
    }
  }
  ctx.log.info('verificação diária', { today, problems: problems.length, alerted })
  return { today, ok: problems.length === 0, problems, alerted }
}
