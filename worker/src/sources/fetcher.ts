import dns from 'node:dns'
import https from 'node:https'
import { isIP, type LookupFunction } from 'node:net'
import zlib from 'node:zlib'
import { HttpError } from '../lib/retry.ts'
import { hostAllowed, isBlockedIp } from './net.ts'

export const USER_AGENT = 'AtualidadeAI-Concursos-Bot/1.0 (+https://atualidadeai-concursos.vercel.app; atualidadeaiconcursos@gmail.com)'

export type FetchResult = {
  status: number
  body: string
  finalUrl: string
  etag?: string
  lastModified?: string
  notModified: boolean
}

export type FetchOptions = {
  allowedHosts: string[]
  etag?: string | null
  lastModified?: string | null
  maxBytes?: number
  timeoutMs?: number
  maxRedirects?: number
  accept?: string
  /** Chamado antes de seguir cada redirecionamento (ex.: conferir o robots.txt do destino); lançar erro interrompe. */
  beforeRedirect?: (to: URL) => Promise<void>
}

/** Resolve o nome e recusa qualquer IP interno (inclusive contra DNS rebinding: a validação ocorre na conexão). */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, '', 4)
    const list = addresses as dns.LookupAddress[]
    const blocked = list.find((a) => isBlockedIp(a.address))
    if (blocked || list.length === 0) return callback(new Error(`endereço bloqueado (rede interna): ${hostname}`), '', 4)
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list)
    callback(null, list[0].address, list[0].family)
  })
}

function decodeBody(buf: Buffer, contentType: string): string {
  const head = buf.subarray(0, 300).toString('latin1')
  const charset = (contentType.match(/charset=([\w-]+)/i)?.[1] ?? head.match(/encoding=["']([\w-]+)["']/i)?.[1] ?? 'utf-8').toLowerCase()
  const label = charset === 'iso-8859-1' || charset === 'latin1' ? 'windows-1252' : charset
  try {
    return new TextDecoder(label).decode(buf)
  } catch {
    return new TextDecoder('utf-8').decode(buf)
  }
}

function requestOnce(url: URL, opts: Required<Pick<FetchOptions, 'maxBytes' | 'timeoutMs' | 'accept'>> & FetchOptions) {
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }>((resolve, reject) => {
    const headers: Record<string, string> = {
      'User-Agent': USER_AGENT,
      Accept: opts.accept,
      'Accept-Encoding': 'gzip, deflate, br',
    }
    if (opts.etag) headers['If-None-Match'] = opts.etag
    if (opts.lastModified) headers['If-Modified-Since'] = opts.lastModified
    const req = https.request(url, { method: 'GET', headers, lookup: guardedLookup, timeout: opts.timeoutMs, signal: AbortSignal.timeout(opts.timeoutMs) }, (res) => {
      const enc = String(res.headers['content-encoding'] ?? '').toLowerCase()
      const stream = enc === 'gzip' ? res.pipe(zlib.createGunzip()) : enc === 'deflate' ? res.pipe(zlib.createInflate()) : enc === 'br' ? res.pipe(zlib.createBrotliDecompress()) : res
      const chunks: Buffer[] = []
      let size = 0
      stream.on('data', (c: Buffer) => {
        size += c.length
        if (size > opts.maxBytes) {
          req.destroy(new Error(`resposta maior que o limite (${opts.maxBytes} bytes)`))
          return
        }
        chunks.push(c)
      })
      stream.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }))
      stream.on('error', reject)
    })
    req.on('timeout', () => req.destroy(Object.assign(new Error('tempo esgotado'), { name: 'TimeoutError' })))
    req.on('error', reject)
    req.end()
  })
}

/**
 * GET seguro para fontes de notícias: só HTTPS, só hosts da fonte, sem IP interno,
 * redirecionamentos limitados e revalidados, tamanho e tempo máximos, cache HTTP.
 */
export async function safeFetch(rawUrl: string, options: FetchOptions): Promise<FetchResult> {
  const opts = { maxBytes: 3_000_000, timeoutMs: 20_000, maxRedirects: 3, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json;q=0.9, */*;q=0.1', ...options }
  let url = new URL(rawUrl)
  for (let hop = 0; hop <= opts.maxRedirects; hop++) {
    if (url.protocol !== 'https:') throw new Error(`somente https é permitido: ${url.protocol}`)
    if (url.username || url.password) throw new Error('URL com credenciais não é permitida')
    if (!hostAllowed(url.hostname, opts.allowedHosts)) throw new Error(`host não permitido para esta fonte: ${url.hostname}`)
    if (url.port && url.port !== '443') throw new Error(`porta não permitida: ${url.port}`)
    const literal = url.hostname.replace(/^\[|\]$/g, '')
    if (isIP(literal) && isBlockedIp(literal)) throw new Error(`endereço bloqueado (rede interna): ${literal}`) // IP literal não passa pelo DNS
    const res = await requestOnce(url, opts)
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.location
      if (!loc || typeof loc !== 'string') throw new HttpError(res.status, 'redirecionamento sem destino')
      const next = new URL(loc, url)
      if (options.beforeRedirect) await options.beforeRedirect(next)
      url = next
      continue
    }
    if (res.status === 304) return { status: 304, body: '', finalUrl: url.href, notModified: true, etag: options.etag ?? undefined, lastModified: options.lastModified ?? undefined }
    if (res.status >= 400) throw new HttpError(res.status, `HTTP ${res.status} em ${url.hostname}`)
    return {
      status: res.status,
      body: decodeBody(res.body, String(res.headers['content-type'] ?? '')),
      finalUrl: url.href,
      etag: typeof res.headers.etag === 'string' ? res.headers.etag.slice(0, 300) : undefined,
      lastModified: typeof res.headers['last-modified'] === 'string' ? res.headers['last-modified'].slice(0, 100) : undefined,
      notModified: false,
    }
  }
  throw new Error(`redirecionamentos demais (> ${opts.maxRedirects})`)
}
