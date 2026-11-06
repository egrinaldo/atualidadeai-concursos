/**
 * POST /functions/v1/editorial   (administrador + MFA (aal2), como o painel /admin)
 *
 * Backend do painel editorial: edições do dia, fila de revisão, edição de análises, fontes,
 * configurações e monitoramento do robô. Usa a chave de serviço SÓ depois de confirmar o administrador.
 * Toda decisão fica registrada em editorial_reviews (quem, quando, o quê).
 *
 * Corpo: { action, ...parâmetros } — ver o switch no final.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0'
import { adminClient, rateLimited, sessionAal, userFromRequest } from '../_shared/db.ts'
import { errorMessage, json, preflight, tooManyRequests } from '../_shared/http.ts'
import { cleanText, EDITABLE_FIELDS, EDITION_TRANSITIONS, isUuid, SETTINGS, validateAnalysisEdit, validateNewSource, validateSetting } from './validate.ts'

type Db = SupabaseClient
type Body = Record<string, unknown>
class UserError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}
// Linhas do banco sem esquema gerado: tratadas como registros genéricos (os dados de entrada é que são validados)
// deno-lint-ignore no-explicit-any
type Any = any
const must = (r: { data: unknown; error: { message: string } | null }, what: string): Any => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`)
  return r.data
}
const brtToday = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10)
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

async function review(db: Db, reviewer: string, target_type: string, target_id: string, action: string, notes?: string | null, changes?: unknown) {
  must(await db.from('editorial_reviews').insert({ reviewer_id: reviewer, target_type, target_id, action, notes: notes ?? null, changes: changes ?? null }), 'registro da decisão')
}

/* ----------------------------- Painel ----------------------------- */

async function dashboard(db: Db) {
  const since = daysAgo(7)
  const [editions, reviewCount, usage, budget, jobs, sources, news24] = await Promise.all([
    db.from('editions').select('id, edition_type, state, reference_date, status, current_version, summary, updated_at').gte('reference_date', new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10)).order('reference_date', { ascending: false }).limit(20),
    db.from('news_clusters').select('id', { count: 'exact', head: true }).eq('needs_review', true).gte('last_seen_at', since).not('status', 'in', '(rejected,discarded)'),
    db.from('ai_usage_logs').select('status, total_tokens, model').gte('created_at', new Date(Date.parse(`${brtToday()}T03:00:00Z`)).toISOString()),
    db.from('app_settings').select('value').eq('key', 'ai.daily_call_budget').maybeSingle(),
    db.from('processing_jobs').select('job_type, status, attempts, last_error, result, finished_at, created_at').order('created_at', { ascending: false }).limit(300),
    db.from('news_sources').select('id, is_active, consecutive_failures, last_success_at'),
    db.from('news').select('id', { count: 'exact', head: true }).gte('collected_at', daysAgo(1)),
  ])
  const eds = must(editions, 'edições') ?? []
  const docs = eds.length ? must(await db.from('generated_documents').select('id, edition_id, version, page_count, file_size, qa_status, status, created_at').in('edition_id', eds.map((e: Any) => e.id)).order('version', { ascending: false }), 'documentos') ?? [] : []
  const u = must(usage, 'uso de IA') ?? []
  const lastJobs: Record<string, unknown> = {}
  for (const j of must(jobs, 'tarefas') ?? []) if (!lastJobs[j.job_type]) lastJobs[j.job_type] = j
  const src = must(sources, 'fontes') ?? []
  return {
    today: brtToday(),
    editions: eds.map((e: Any) => ({ ...e, document: docs.find((d: Any) => d.edition_id === e.id) ?? null })),
    reviewCount: reviewCount.count ?? 0,
    ai: {
      calls: u.filter((x: Any) => x.status !== 'invalid_output').length,
      errors: u.filter((x: Any) => ['error', 'timeout', 'rate_limited'].includes(x.status)).length,
      invalidOutputs: u.filter((x: Any) => x.status === 'invalid_output').length,
      tokens: u.reduce((a: Any, x: Any) => a + (x.total_tokens ?? 0), 0),
      budget: Number(budget.data?.value ?? 120),
    },
    jobs: lastJobs,
    sources: { active: src.filter((s: Any) => s.is_active).length, failing: src.filter((s: Any) => s.is_active && s.consecutive_failures > 0).length, total: src.length },
    newsLast24h: news24.count ?? 0,
  }
}

/* ----------------------------- Edições ----------------------------- */

const ANALYSIS_COLS = 'id, status, kind, audit_status, audit_report, period_meta, editorial_title, summary, cluster_id, news_clusters!inner(id, scope, state, category, relevance_score, verification_status, source_count, needs_review, status)'

async function edition(db: Db, id: string) {
  const ed = must(await db.from('editions').select('*').eq('id', id).maybeSingle(), 'edição')
  if (!ed) throw new UserError('Edição não encontrada.', 404)
  const [items, docs] = await Promise.all([
    db.from('edition_items').select(`block, position, analysis_id, news_analyses!inner(${ANALYSIS_COLS})`).eq('edition_id', id).order('position'),
    db.from('generated_documents').select('id, version, page_count, file_size, qa_status, qa_report, status, template_version, created_at').eq('edition_id', id).order('version', { ascending: false }),
  ])
  const it = must(items, 'itens') ?? []
  // Candidatos para incluir: assuntos analisados da janela da edição (com tolerância de 12h), fora da edição
  const inEdition = new Set(it.map((i: Any) => (i.news_analyses as unknown as { cluster_id: string }).cluster_id))
  const from = new Date(Date.parse(ed.period_start) - 12 * 3_600_000).toISOString()
  const cands = must(
    await db.from('news_clusters')
      .select('id, title, scope, state, relevance_score, verification_status, source_count, needs_review, news_analyses!inner(id, status, editorial_title, generated_at, audit_status)')
      .eq('status', 'analyzed').in('news_analyses.status', ['valid', 'edited']).eq('news_analyses.kind', 'analise').gte('last_seen_at', from).lte('last_seen_at', ed.period_end)
      .order('relevance_score', { ascending: false }).limit(60),
    'candidatos',
  ) ?? []
  const candidates = cands
    .filter((c: Any) => !inEdition.has(c.id) && (c.scope !== 'estadual' || c.state === ed.state))
    .map((c: Any) => {
      const a = [...(c.news_analyses as { id: string; editorial_title: string; generated_at: string; audit_status: string }[])].sort((x: Any, y: Any) => y.generated_at.localeCompare(x.generated_at))[0]
      return { cluster_id: c.id, analysis_id: a.id, title: a.editorial_title, audit_status: a.audit_status, scope: c.scope, state: c.state, relevance_score: c.relevance_score, verification_status: c.verification_status, source_count: c.source_count, needs_review: c.needs_review }
    })
    .slice(0, 30)
  return { edition: ed, items: it, documents: must(docs, 'documentos') ?? [], candidates }
}

async function editableEdition(db: Db, id: string) {
  const ed = must(await db.from('editions').select('id, status').eq('id', id).maybeSingle(), 'edição')
  if (!ed) throw new UserError('Edição não encontrada.', 404)
  if (!['draft', 'in_review', 'approved', 'failed'].includes(ed.status)) throw new UserError('Edição já gerada/publicada: use "Gerar de novo" para liberar alterações.')
  return ed
}

async function editionStatus(db: Db, reviewer: string, id: string, op: string, notes: string | null) {
  const allowed = EDITION_TRANSITIONS[op]
  if (!allowed) throw new UserError('Operação inválida.')
  const ed = must(await db.from('editions').select('id, status').eq('id', id).maybeSingle(), 'edição')
  if (!ed) throw new UserError('Edição não encontrada.', 404)
  if (!allowed.includes(ed.status)) throw new UserError(`Não é possível ${op === 'approve' ? 'aprovar' : op === 'hold' ? 'reter' : 'gerar de novo'} uma edição com status "${ed.status}".`)
  const to = op === 'hold' ? 'draft' : 'approved'
  must(await db.from('editions').update({ status: to }).eq('id', id).eq('status', ed.status), 'status da edição')
  await review(db, reviewer, 'edition', id, op === 'approve' ? 'approve' : op === 'hold' ? 'hold' : 'regenerate', notes, { from: ed.status, to })
  return { ok: true, status: to }
}

async function editionItem(db: Db, reviewer: string, body: Body) {
  const id = body.edition_id as string
  const analysisId = body.analysis_id as string
  if (!isUuid(id) || !isUuid(analysisId)) throw new UserError('Parâmetros inválidos.')
  await editableEdition(db, id)
  const items = must(await db.from('edition_items').select('analysis_id, block, position').eq('edition_id', id).order('position'), 'itens') ?? []
  const op = body.op
  if (op === 'remove') {
    must(await db.from('edition_items').delete().eq('edition_id', id).eq('analysis_id', analysisId), 'remover item')
    await review(db, reviewer, 'edition', id, 'remove_item', null, { analysis_id: analysisId })
  } else if (op === 'add') {
    const block = body.block
    if (block !== 'estado' && block !== 'nacional' && block !== 'internacional') throw new UserError('Bloco inválido.')
    const a = must(await db.from('news_analyses').select('id, status').eq('id', analysisId).maybeSingle(), 'análise')
    if (!a || !['valid', 'edited'].includes(a.status)) throw new UserError('Análise inexistente ou não válida.')
    if (items.some((i: Any) => i.analysis_id === analysisId)) throw new UserError('Assunto já está na edição.')
    const pos = Math.max(-1, ...items.filter((i: Any) => i.block === block).map((i: Any) => i.position)) + 1
    must(await db.from('edition_items').insert({ edition_id: id, analysis_id: analysisId, block, position: pos }), 'incluir item')
    await review(db, reviewer, 'edition', id, 'add_item', null, { analysis_id: analysisId, block })
  } else if (op === 'up' || op === 'down') {
    const cur = items.find((i: Any) => i.analysis_id === analysisId)
    if (!cur) throw new UserError('Item não está na edição.')
    const same = items.filter((i: Any) => i.block === cur.block).sort((a: Any, b: Any) => a.position - b.position)
    const idx = same.findIndex((i: Any) => i.analysis_id === analysisId)
    const other = same[op === 'up' ? idx - 1 : idx + 1]
    if (!other) return { ok: true }
    must(await db.from('edition_items').update({ position: other.position }).eq('edition_id', id).eq('analysis_id', cur.analysis_id), 'mover item')
    must(await db.from('edition_items').update({ position: cur.position }).eq('edition_id', id).eq('analysis_id', other.analysis_id), 'mover item')
    await review(db, reviewer, 'edition', id, 'move_item', null, { analysis_id: analysisId, direction: op })
  } else throw new UserError('Operação inválida.')
  // Qualquer mudança volta a edição para revisão (se estava aprovada/falhou)
  await db.from('editions').update({ status: 'in_review' }).eq('id', id).in('status', ['approved', 'failed', 'draft'])
  return { ok: true }
}

async function documentUrl(db: Db, id: string) {
  const d = must(await db.from('generated_documents').select('storage_path, status, version, editions!inner(edition_type, state, reference_date)').eq('id', id).maybeSingle(), 'documento')
  if (!d || d.status === 'deleted' || d.storage_path.startsWith('qa-reprovado/')) throw new UserError('Arquivo indisponível.', 404)
  const e = d.editions as unknown as { edition_type: string; state: string; reference_date: string }
  const name = `informativo-${e.edition_type}-${e.state}-${e.reference_date}-v${d.version}.pdf`
  const { data, error } = await db.storage.from('documents').createSignedUrl(d.storage_path, 300, { download: name })
  if (error || !data) throw new Error(`link: ${error?.message}`)
  return { url: data.signedUrl, expiresIn: 300 }
}

/* ------------------------- Fila de revisão ------------------------- */

async function reviewQueue(db: Db) {
  const rows = must(
    await db.from('news_clusters')
      .select('id, title, scope, state, category, relevance_score, verification_status, source_count, status, last_seen_at, news_analyses(id, kind, status, validation_errors, audit_status, audit_report, generated_at)')
      .eq('needs_review', true).gte('last_seen_at', daysAgo(7)).not('status', 'in', '(rejected,discarded)')
      .order('relevance_score', { ascending: false }).limit(100),
    'fila',
  ) ?? []
  return {
    rows: rows.map((r: Any) => {
      const latest = [...((r.news_analyses ?? []) as { id: string; kind: string; status: string; validation_errors: unknown; generated_at: string }[])].filter((a: Any) => a.kind === 'analise').sort((a: Any, b: Any) => b.generated_at.localeCompare(a.generated_at))[0] ?? null
      const { news_analyses: _, ...rest } = r
      return { ...rest, analysis: latest }
    }),
  }
}

async function cluster(db: Db, id: string) {
  const c = must(await db.from('news_clusters').select('*').eq('id', id).maybeSingle(), 'assunto')
  if (!c) throw new UserError('Assunto não encontrado.', 404)
  const [members, verification, analyses, history] = await Promise.all([
    db.from('news').select('id, title, excerpt, original_url, published_at, news_sources!inner(name, is_primary, reliability_level)').eq('cluster_id', id).eq('status', 'clustered').order('published_at', { ascending: false }).limit(40),
    db.from('news_verifications').select('verification_status, confidence_level, analysis, independent_sources, needs_human_review, verified_at').eq('cluster_id', id).order('verified_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('news_analyses').select('*').eq('cluster_id', id).order('generated_at', { ascending: false }).limit(8),
    db.from('editorial_reviews').select('action, notes, changes, created_at').eq('target_type', 'cluster').eq('target_id', id).order('created_at', { ascending: false }).limit(20),
  ])
  return { cluster: c, members: must(members, 'matérias') ?? [], verification: must(verification, 'verificação'), analyses: must(analyses, 'análises') ?? [], history: must(history, 'histórico') ?? [] }
}

async function clusterDecide(db: Db, reviewer: string, id: string, decision: string, notes: string | null) {
  const c = must(await db.from('news_clusters').select('id, status').eq('id', id).maybeSingle(), 'assunto')
  if (!c) throw new UserError('Assunto não encontrado.', 404)
  if (decision === 'approve') {
    must(await db.from('news_clusters').update({ needs_review: false }).eq('id', id), 'aprovar')
    await review(db, reviewer, 'cluster', id, 'approve', notes)
  } else if (decision === 'reject') {
    must(await db.from('news_clusters').update({ status: 'rejected', needs_review: false }).eq('id', id), 'reprovar')
    await review(db, reviewer, 'cluster', id, 'reject', notes)
  } else if (decision === 'reanalyze') {
    // Análises atuais deixam de valer; a próxima rodada do robô gera outra (consome cota de IA)
    must(await db.from('news_analyses').update({ status: 'superseded' }).eq('cluster_id', id).eq('kind', 'analise').in('status', ['valid', 'invalid', 'edited']), 'invalidar análises')
    must(await db.from('news_clusters').update({ status: 'verified', needs_review: false }).eq('id', id).not('status', 'in', '(rejected,discarded,published)'), 'reanálise')
    await review(db, reviewer, 'cluster', id, 'request_reanalysis', notes)
  } else throw new UserError('Decisão inválida.')
  return { ok: true }
}

/**
 * Edição manual da análise: cria uma NOVA versão (status "edited", autor registrado) e mantém a original
 * no histórico ("superseded"). Edições ainda não geradas passam a usar a versão editada.
 */
async function analysisEdit(db: Db, reviewer: string, id: string, changes: unknown, notes: string | null) {
  const v = validateAnalysisEdit(changes)
  if (!v.ok) throw new UserError(v.error)
  const a = must(await db.from('news_analyses').select('*').eq('id', id).maybeSingle(), 'análise')
  if (!a) throw new UserError('Análise não encontrada.', 404)
  if (!['valid', 'edited', 'invalid'].includes(a.status)) throw new UserError('Esta versão da análise não está mais em uso.')
  if (a.status === 'invalid' && (!v.value.fields.editorial_title || !v.value.fields.summary || !v.value.fields.what_happened))
    throw new UserError('Para aproveitar uma análise reprovada, revise ao menos título, resumo e "O que aconteceu".')
  const { id: _id, generated_at: _g, ...base } = a
  const content = { ...(a.content ?? {}), edicao_manual: { campos: Object.keys(v.value.fields).concat(v.value.memorize ? ['memorize'] : []), em: new Date().toISOString() } }
  // Texto mudou: a nova versão passa pela auditoria de veracidade de novo antes do PDF
  const audit = { audit_status: 'pendente', audit_report: null, audit_model: null, audit_hash: null, audited_at: null }
  const row = { ...base, ...v.value.fields, ...(v.value.memorize ? { memorize: v.value.memorize } : {}), ...audit, status: 'edited', edited_by: reviewer, content, validation_errors: a.validation_errors }
  const created = must(await db.from('news_analyses').insert(row).select('id').single(), 'nova versão')
  must(await db.from('news_analyses').update({ status: 'superseded' }).eq('id', id), 'versão anterior')
  // Edições que ainda não foram geradas passam a apontar para a versão editada
  const eds = must(await db.from('editions').select('id').in('status', ['draft', 'in_review', 'approved', 'failed']), 'edições') ?? []
  if (eds.length) must(await db.from('edition_items').update({ analysis_id: created.id }).eq('analysis_id', id).in('edition_id', eds.map((e: Any) => e.id)), 'atualizar edições')
  must(await db.from('news_clusters').update({ needs_review: false, status: 'analyzed' }).eq('id', a.cluster_id).not('status', 'in', '(rejected,discarded,published)'), 'assunto')
  const diff = Object.fromEntries(Object.keys(v.value.fields).map((k: Any) => [k, { antes: (a as Record<string, unknown>)[k], depois: (v.value.fields as Record<string, unknown>)[k] }]))
  await review(db, reviewer, 'analysis', created.id, 'edit', notes, { from_analysis: id, ...diff, ...(v.value.memorize ? { memorize: { antes: a.memorize, depois: v.value.memorize } } : {}) })
  return { ok: true, analysis_id: created.id }
}

/**
 * Decisão do editor sobre a auditoria de veracidade:
 * - "waive": libera o texto para o PDF mesmo reprovado/com erro (exige justificativa; fica registrado);
 * - "reaudit": volta para a fila do auditor (ex.: depois de corrigir a fonte ou o texto).
 */
async function auditDecide(db: Db, reviewer: string, id: string, op: string, notes: string | null) {
  const a = must(await db.from('news_analyses').select('id, status, kind, cluster_id, audit_status, audit_report').eq('id', id).maybeSingle(), 'análise')
  if (!a) throw new UserError('Análise não encontrada.', 404)
  if (!['valid', 'edited'].includes(a.status)) throw new UserError('Esta versão da análise não está mais em uso.')
  if (op === 'waive') {
    if (!notes || notes.trim().length < 10) throw new UserError('Explique por que a auditoria pode ser dispensada (mín. 10 caracteres).')
    must(await db.from('news_analyses').update({ audit_status: 'dispensada', audited_at: new Date().toISOString() }).eq('id', id), 'dispensar auditoria')
    if (a.kind === 'analise') must(await db.from('news_clusters').update({ needs_review: false }).eq('id', a.cluster_id).not('status', 'in', '(rejected,discarded)'), 'assunto')
    await review(db, reviewer, 'analysis', id, 'waive_audit', notes, { antes: a.audit_status, problemas: (a.audit_report as Any)?.problems ?? [] })
  } else if (op === 'reaudit') {
    must(await db.from('news_analyses').update({ audit_status: 'pendente', audit_report: null, audit_hash: null, audited_at: null }).eq('id', id), 'auditar de novo')
    await review(db, reviewer, 'analysis', id, 'request_audit', notes, { antes: a.audit_status })
  } else throw new UserError('Operação inválida.')
  return { ok: true }
}

/* ------------------------------ Fontes ------------------------------ */

async function sources(db: Db) {
  const [rows, logs] = await Promise.all([
    db.from('news_sources').select('id, name, website, feed_url, source_type, scope, state, language, reliability_level, is_primary, is_active, content_mode, consecutive_failures, last_checked_at, last_success_at, last_error, terms_notes, news_source_groups(name)').order('is_active', { ascending: false }).order('name'),
    db.from('source_fetch_logs').select('source_id, status, items_inserted').gte('created_at', daysAgo(7)),
  ])
  const stats = new Map<string, { runs: number; ok: number; inserted: number }>()
  for (const l of must(logs, 'registros de coleta') ?? []) {
    const s = stats.get(l.source_id) ?? { runs: 0, ok: 0, inserted: 0 }
    s.runs++
    if (l.status === 'ok' || l.status === 'not_modified') s.ok++
    s.inserted += l.items_inserted ?? 0
    stats.set(l.source_id, s)
  }
  return { rows: (must(rows, 'fontes') ?? []).map((r: Any) => ({ ...r, week: stats.get(r.id) ?? { runs: 0, ok: 0, inserted: 0 } })) }
}

async function sourceUpdate(db: Db, reviewer: string, body: Body) {
  const id = body.source_id
  if (!isUuid(id)) throw new UserError('Fonte inválida.')
  const patch: Record<string, unknown> = {}
  if (typeof body.is_active === 'boolean') patch.is_active = body.is_active
  if (body.reliability_level !== undefined) {
    const r = Number(body.reliability_level)
    if (!Number.isInteger(r) || r < 1 || r > 5) throw new UserError('Confiabilidade: de 1 a 5.')
    patch.reliability_level = r
  }
  if (body.terms_notes !== undefined) {
    const t = cleanText(body.terms_notes, 20, 1000, 'Termos de uso')
    if (!t.ok) throw new UserError(t.error)
    patch.terms_notes = t.value
  }
  if (!Object.keys(patch).length) throw new UserError('Nada para alterar.')
  if (patch.is_active === true) patch.consecutive_failures = 0 // reativar zera a espera por falhas
  const before = must(await db.from('news_sources').select('is_active, reliability_level, terms_notes').eq('id', id).maybeSingle(), 'fonte')
  if (!before) throw new UserError('Fonte não encontrada.', 404)
  must(await db.from('news_sources').update(patch).eq('id', id), 'atualizar fonte')
  await review(db, reviewer, 'source', id, 'update', null, { antes: before, depois: patch })
  return { ok: true }
}

async function sourceCreate(db: Db, reviewer: string, input: unknown) {
  const v = validateNewSource(input)
  if (!v.ok) throw new UserError(v.error)
  const dup = must(await db.from('news_sources').select('id').eq('feed_url', v.value.feed_url).maybeSingle(), 'duplicidade')
  if (dup) throw new UserError('Já existe uma fonte com este endereço.')
  const created = must(await db.from('news_sources').insert({ ...v.value, is_active: true }).select('id').single(), 'cadastrar fonte')
  await review(db, reviewer, 'source', created.id, 'create', null, v.value)
  return { ok: true, source_id: created.id }
}

/* ---------------------- Configurações e robô ---------------------- */

async function settings(db: Db) {
  const rows = must(await db.from('app_settings').select('key, value, updated_at').in('key', Object.keys(SETTINGS)), 'configurações') ?? []
  return { rows: Object.entries(SETTINGS).map(([key, s]: Any) => ({ key, label: s.label, help: s.help, value: rows.find((r: Any) => r.key === key)?.value ?? null, updated_at: rows.find((r: Any) => r.key === key)?.updated_at ?? null })) }
}

async function settingUpdate(db: Db, reviewer: string, key: unknown, value: unknown) {
  const v = validateSetting(key, value)
  if (!v.ok) throw new UserError(v.error)
  const before = must(await db.from('app_settings').select('value').eq('key', v.value.key).maybeSingle(), 'configuração')
  must(await db.from('app_settings').upsert({ key: v.value.key, value: v.value.value, updated_by: reviewer, updated_at: new Date().toISOString() }), 'salvar configuração')
  await review(db, reviewer, 'setting', crypto.randomUUID(), 'update', v.value.key, { chave: v.value.key, antes: before?.value ?? null, depois: v.value.value })
  return { ok: true }
}

async function robot(db: Db) {
  const [jobs, usage, fetchErrors] = await Promise.all([
    db.from('processing_jobs').select('id, job_type, status, attempts, last_error, result, created_at, finished_at').order('created_at', { ascending: false }).limit(60),
    db.from('ai_usage_logs').select('model, task, status, total_tokens, latency_ms, error, created_at').gte('created_at', daysAgo(7)).order('created_at', { ascending: false }).limit(1000),
    db.from('source_fetch_logs').select('status, error, created_at, news_sources!inner(name)').in('status', ['error', 'blocked']).gte('created_at', daysAgo(2)).order('created_at', { ascending: false }).limit(30),
  ])
  const byDay = new Map<string, { calls: number; errors: number; invalid: number; tokens: number }>()
  for (const u of must(usage, 'uso de IA') ?? []) {
    const d = new Date(Date.parse(u.created_at) - 3 * 3_600_000).toISOString().slice(0, 10)
    const s = byDay.get(d) ?? { calls: 0, errors: 0, invalid: 0, tokens: 0 }
    if (u.status === 'invalid_output') s.invalid++
    else s.calls++
    if (['error', 'timeout', 'rate_limited'].includes(u.status)) s.errors++
    s.tokens += u.total_tokens ?? 0
    byDay.set(d, s)
  }
  return {
    jobs: (must(jobs, 'tarefas') ?? []).map((j: Any) => ({ ...j, result: j.result ? JSON.stringify(j.result).slice(0, 400) : null })),
    aiByDay: [...byDay.entries()].sort(([a]: Any, [b]: Any) => b.localeCompare(a)).map(([day, s]: Any) => ({ day, ...s })),
    fetchErrors: must(fetchErrors, 'falhas de coleta') ?? [],
  }
}

/* ------------------------------ Rotas ------------------------------ */

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const db = adminClient()
  const user = await userFromRequest(req, db)
  if (!user) return json({ error: 'Faça login.' }, 401)
  const { data: isAdmin } = await db.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!isAdmin) return json({ error: 'Acesso restrito a administradores.' }, 403)
  if (sessionAal(req) !== 'aal2') return json({ error: 'Confirme o código de verificação (MFA) para acessar o painel.', code: 'mfa_required' }, 403)
  if (await rateLimited(db, `editorial:${user.id}`, 180, 60)) return tooManyRequests()

  const body = (await req.json().catch(() => ({}))) as Body
  const action = String(body.action ?? '')
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 2000) : null
  const uuid = (k: string) => {
    if (!isUuid(body[k])) throw new UserError('Parâmetros inválidos.')
    return body[k] as string
  }

  try {
    switch (action) {
      case 'dashboard': return json(await dashboard(db))
      case 'edition': return json(await edition(db, uuid('edition_id')))
      case 'edition_status': return json(await editionStatus(db, user.id, uuid('edition_id'), String(body.op), notes))
      case 'edition_item': return json(await editionItem(db, user.id, body))
      case 'document_url': return json(await documentUrl(db, uuid('document_id')))
      case 'review_queue': return json(await reviewQueue(db))
      case 'cluster': return json(await cluster(db, uuid('cluster_id')))
      case 'cluster_decide': return json(await clusterDecide(db, user.id, uuid('cluster_id'), String(body.decision), notes))
      case 'analysis_edit': return json(await analysisEdit(db, user.id, uuid('analysis_id'), body.changes, notes))
      case 'audit_decide': return json(await auditDecide(db, user.id, uuid('analysis_id'), String(body.op), notes))
      case 'sources': return json(await sources(db))
      case 'source_update': return json(await sourceUpdate(db, user.id, body))
      case 'source_create': return json(await sourceCreate(db, user.id, body.source))
      case 'settings': return json(await settings(db))
      case 'setting_update': return json(await settingUpdate(db, user.id, body.key, body.value))
      case 'robot': return json(await robot(db))
      case 'fields': return json({ editable: EDITABLE_FIELDS })
      default: return json({ error: 'Ação desconhecida.' }, 400)
    }
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message }, e.status)
    console.error('[editorial]', action, errorMessage(e))
    return json({ error: 'Não foi possível concluir a operação. Tente novamente.' }, 502)
  }
})
