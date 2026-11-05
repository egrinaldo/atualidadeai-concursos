import { safeFetch } from '../sources/fetcher.ts'
import { canonicalUrl, contentFingerprint, excerpt, sha256 } from '../sources/normalize.ts'
import { parseFeed, parseIbge, type RawItem } from '../sources/parse.ts'
import { isAllowed, parseRobots, type RobotsRules } from '../sources/robots.ts'
import type { JobContext } from './types.ts'

export type Source = {
  id: string
  name: string
  feed_url: string | null
  source_type: 'rss' | 'atom' | 'api' | 'html'
  api_kind: string | null
  scope: 'internacional' | 'nacional' | 'estadual'
  state: string | null
  language: string
  default_category: string | null
  allowed_hosts: string[]
  fetch_interval_minutes: number
  is_active: boolean
  last_checked_at: string | null
  consecutive_failures: number
  http_etag: string | null
  http_last_modified: string | null
}

export const LIMITS = { maxItemsPerSource: 50, maxAgeDays: 7, contentDedupeDays: 14, hostConcurrency: 4, minDelayMs: 2000, maxDelayMs: 15000 }

/** Fonte vence no intervalo configurado; após falhas seguidas, espera cresce (até 8× e no máx. 24h). */
export function isDue(s: Pick<Source, 'last_checked_at' | 'fetch_interval_minutes' | 'consecutive_failures'>, now: Date): boolean {
  if (!s.last_checked_at) return true
  const factor = Math.min(2 ** Math.max(0, s.consecutive_failures), 8)
  const waitMin = Math.min(s.fetch_interval_minutes * factor, 24 * 60) - 5 // 5 min de tolerância para o agendador
  return now.getTime() - new Date(s.last_checked_at).getTime() >= waitMin * 60_000
}

/** Converte itens do feed em linhas da tabela news (texto puro, limites de tamanho, datas sãs). */
export function toNewsRows(source: Source, items: RawItem[], now: Date) {
  const oldest = now.getTime() - LIMITS.maxAgeDays * 86_400_000
  const seen = new Set<string>()
  const rows = []
  for (const it of items
    .slice()
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .slice(0, LIMITS.maxItemsPerSource)) {
    let canonical: string
    try {
      canonical = canonicalUrl(it.url)
    } catch {
      continue
    }
    if (!/^https?:\/\//.test(it.url) || seen.has(canonical)) continue
    seen.add(canonical)
    let published = it.publishedAt
    if (published && published.getTime() > now.getTime() + 3_600_000) published = null // data no futuro: ignorar
    if (published && published.getTime() < oldest) continue // antiga demais
    const body = it.content || it.summary
    rows.push({
      source_id: source.id,
      title: it.title.slice(0, 500),
      original_url: it.url.slice(0, 2000),
      canonical_url: canonical.slice(0, 2000),
      url_hash: sha256(canonical),
      content_hash: contentFingerprint(it.title, body),
      original_content: body ? body.slice(0, 20_000) : null,
      excerpt: (it.summary || it.content) ? excerpt(it.summary || it.content, 400) : null,
      author: it.author?.slice(0, 200) ?? null,
      language: source.language,
      published_at: published?.toISOString() ?? null,
      collected_at: now.toISOString(),
      scope: source.scope,
      state: source.state,
      category: source.default_category,
      status: 'collected' as const,
    })
  }
  return rows
}

type SourceResult = { source: string; status: 'ok' | 'not_modified' | 'blocked' | 'error'; found?: number; inserted?: number; duplicates_content?: number; http_status?: number; error?: string; duration_ms: number }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function robotsFor(origin: string, host: string, cache: Map<string, RobotsRules | 'unavailable'>) {
  if (cache.has(origin)) return cache.get(origin)!
  let rules: RobotsRules | 'unavailable'
  try {
    const r = await safeFetch(origin + '/robots.txt', { allowedHosts: [host], timeoutMs: 15_000, maxBytes: 500_000, accept: 'text/plain, */*' })
    rules = parseRobots(r.body)
  } catch (e) {
    // RFC 9309: 4xx = sem restrições; erro de servidor/rede = não coletar nesta rodada
    const status = (e as { status?: number }).status
    rules = status && status >= 400 && status < 500 ? { rules: [], crawlDelaySec: null } : 'unavailable'
  }
  cache.set(origin, rules)
  return rules
}

async function collectSource(source: Source, ctx: JobContext, robotsCache: Map<string, RobotsRules | 'unavailable'>, now: Date): Promise<SourceResult & { crawlDelayMs: number }> {
  const started = Date.now()
  let crawlDelayMs = LIMITS.minDelayMs
  const base = { source: source.name }
  try {
    if (!source.feed_url) throw new Error('fonte sem endereço de coleta')
    const url = new URL(source.feed_url)
    // APIs públicas documentadas (ex.: IBGE) são feitas para acesso automatizado; feeds seguem robots.txt
    if (source.source_type !== 'api') {
      const robots = await robotsFor(url.origin, url.hostname, robotsCache)
      if (robots === 'unavailable') throw new Error('robots.txt indisponível (erro de servidor/rede): coleta adiada')
      if (!isAllowed(robots, url.pathname + url.search)) {
        await ctx.db.from('news_sources').update({ last_checked_at: now.toISOString(), last_error: 'bloqueado pelo robots.txt' }).eq('id', source.id)
        return { ...base, status: 'blocked', error: 'bloqueado pelo robots.txt', duration_ms: Date.now() - started, crawlDelayMs }
      }
      if (robots.crawlDelaySec) crawlDelayMs = Math.min(Math.max(robots.crawlDelaySec * 1000, LIMITS.minDelayMs), LIMITS.maxDelayMs)
    }

    const res = await safeFetch(source.feed_url, { allowedHosts: source.allowed_hosts, etag: source.http_etag, lastModified: source.http_last_modified })
    const health = { last_checked_at: now.toISOString(), last_success_at: now.toISOString(), last_error: null, consecutive_failures: 0, http_etag: res.etag ?? source.http_etag, http_last_modified: res.lastModified ?? source.http_last_modified }
    if (res.notModified) {
      await ctx.db.from('news_sources').update(health).eq('id', source.id)
      return { ...base, status: 'not_modified', http_status: 304, found: 0, inserted: 0, duration_ms: Date.now() - started, crawlDelayMs }
    }

    const items = source.api_kind === 'ibge' ? parseIbge(res.body) : parseFeed(res.body)
    const rows = toNewsRows(source, items, now)
    let inserted: { id: string; content_hash: string | null }[] = []
    if (rows.length) {
      const { data, error } = await ctx.db.from('news').upsert(rows, { onConflict: 'url_hash', ignoreDuplicates: true }).select('id, content_hash')
      if (error) throw new Error(`gravação: ${error.message}`)
      inserted = data ?? []
    }

    // Mesmo conteúdo publicado em outro endereço (republicação): fica registrado, mas descartado
    let dupContent = 0
    const hashes = inserted.map((r) => r.content_hash).filter((h): h is string => Boolean(h))
    if (hashes.length) {
      const since = new Date(now.getTime() - LIMITS.contentDedupeDays * 86_400_000).toISOString()
      const { data: existing } = await ctx.db.from('news').select('id, content_hash, collected_at').in('content_hash', hashes).gte('collected_at', since).order('collected_at', { ascending: true }).order('id')
      const firstByHash = new Map<string, string>()
      for (const e of existing ?? []) if (e.content_hash && !firstByHash.has(e.content_hash)) firstByHash.set(e.content_hash, e.id)
      const dups = inserted.filter((r) => r.content_hash && firstByHash.get(r.content_hash) !== r.id)
      for (const d of dups) {
        await ctx.db.from('news').update({ status: 'discarded', discard_reason: `conteúdo duplicado de ${firstByHash.get(d.content_hash!)}` }).eq('id', d.id)
      }
      dupContent = dups.length
    }

    await ctx.db.from('news_sources').update(health).eq('id', source.id)
    return { ...base, status: 'ok', http_status: res.status, found: items.length, inserted: inserted.length, duplicates_content: dupContent, duration_ms: Date.now() - started, crawlDelayMs }
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 1000)
    await ctx.db
      .from('news_sources')
      .update({ last_checked_at: now.toISOString(), last_error: message, consecutive_failures: source.consecutive_failures + 1 })
      .eq('id', source.id)
    return { ...base, status: 'error', error: message, http_status: (e as { status?: number }).status, duration_ms: Date.now() - started, crawlDelayMs }
  }
}

/**
 * Coleta: consulta as fontes ativas que venceram o intervalo, respeitando robots.txt,
 * crawl-delay e uma requisição por vez por servidor. Payload opcional: { sourceId, force }.
 */
export async function collect(job: { payload: Record<string, unknown>; id: string }, ctx: JobContext) {
  const now = new Date()
  const { data, error } = await ctx.db.from('news_sources').select('*').eq('is_active', true)
  if (error) throw new Error(`fontes: ${error.message}`)
  const onlyId = typeof job.payload.sourceId === 'string' ? job.payload.sourceId : null
  const force = job.payload.force === true
  const sources = ((data ?? []) as Source[]).filter((s) => (onlyId ? s.id === onlyId : force || isDue(s, now)))

  // Agrupa por servidor: um servidor por vez recebe requisições, com pausa entre elas
  const byHost = new Map<string, Source[]>()
  for (const s of sources) {
    const host = s.feed_url ? new URL(s.feed_url).hostname : 'sem-host'
    byHost.set(host, [...(byHost.get(host) ?? []), s])
  }
  const robotsCache = new Map<string, RobotsRules | 'unavailable'>()
  const results: SourceResult[] = []
  const hosts = [...byHost.values()]
  let next = 0
  async function workerLoop() {
    while (next < hosts.length) {
      const group = hosts[next++]
      for (let i = 0; i < group.length; i++) {
        const r = await collectSource(group[i], ctx, robotsCache, now)
        const { crawlDelayMs, ...result } = r
        results.push(result)
        await ctx.db.from('source_fetch_logs').insert({
          source_id: group[i].id, job_id: job.id === 'direto' ? null : job.id, status: result.status, http_status: result.http_status ?? null,
          items_found: result.found ?? 0, items_inserted: result.inserted ?? 0, duplicates_content: result.duplicates_content ?? 0,
          error: result.error ?? null, duration_ms: result.duration_ms,
        })
        ctx.log.info('fonte coletada', result)
        if (i < group.length - 1) await sleep(crawlDelayMs)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(LIMITS.hostConcurrency, hosts.length) }, workerLoop))

  const sum = (k: 'found' | 'inserted' | 'duplicates_content') => results.reduce((a, r) => a + (r[k] ?? 0), 0)
  return {
    sources_checked: results.length,
    sources_ok: results.filter((r) => r.status === 'ok' || r.status === 'not_modified').length,
    sources_error: results.filter((r) => r.status === 'error').length,
    sources_blocked: results.filter((r) => r.status === 'blocked').length,
    items_found: sum('found'),
    items_inserted: sum('inserted'),
    duplicates_content: sum('duplicates_content'),
    errors: results.filter((r) => r.error).map((r) => `${r.source}: ${r.error}`).slice(0, 20),
  }
}
