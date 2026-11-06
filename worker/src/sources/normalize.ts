import { createHash } from 'node:crypto'

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', ordm: 'º', ordf: 'ª', deg: '°',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  atilde: 'ã', otilde: 'õ', Atilde: 'Ã', Otilde: 'Õ', acirc: 'â', ecirc: 'ê', ocirc: 'ô', Acirc: 'Â', Ecirc: 'Ê', Ocirc: 'Ô',
  agrave: 'à', Agrave: 'À', ccedil: 'ç', Ccedil: 'Ç', uuml: 'ü', Uuml: 'Ü', euro: '€', copy: '©', reg: '®', trade: '™', middot: '·', bull: '•',
}

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return code > 0 && code < 0x110000 && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : ''
    }
    return NAMED[e] ?? m
  })
}

/** Converte HTML em texto puro (nada de HTML é guardado: evita XSS nos PDFs e no painel). */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return ''
  // Feeds que trazem HTML "escapado" (&lt;p&gt;): decodifica antes de remover as tags
  const source = /&lt;\/?[a-z]/i.test(html) ? decodeEntities(html) : html
  return decodeEntities(
    source
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<(script|style|noscript|iframe|svg)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/(p|div|li|h[1-6]|br|tr)>|<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const TRACKING = /^(utm_[a-z]+|fbclid|gclid|gbraid|wbraid|mc_cid|mc_eid|igshid|ref|ref_src|xtor|cmpid|origem|amp)$/i

/** URL canônica para deduplicação: host minúsculo, sem fragmento, sem parâmetros de rastreamento. */
export function canonicalUrl(raw: string): string {
  const u = new URL(raw.trim())
  u.hash = ''
  u.hostname = u.hostname.toLowerCase()
  if (u.protocol === 'http:') u.protocol = 'https:'
  if ((u.protocol === 'https:' && u.port === '443') || (u.protocol === 'http:' && u.port === '80')) u.port = ''
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k)
  u.searchParams.sort()
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '')
  return u.toString()
}

export const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

/** Impressão do conteúdo: título + texto normalizados (minúsculas, sem acentos/pontuação). */
export function contentFingerprint(title: string, text: string): string {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return sha256(norm(title) + '|' + norm(text).slice(0, 2000))
}

/** Remove metades soltas de caracteres especiais (emoji etc.) — JSON com elas é rejeitado pelo banco. */
export function dropLoneSurrogates(s: string): string {
  return s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
}

/** Corta em até `max` unidades sem partir caracteres especiais ao meio. */
export function safeSlice(s: string, max: number): string {
  return dropLoneSurrogates(s.slice(0, max))
}

export function excerpt(text: string, max = 400): string {
  if (text.length <= max) return dropLoneSurrogates(text)
  const cut = safeSlice(text, max)
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 40)).trim() + '…'
}

export function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const s = String(value).trim()
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/) // IBGE: dd/mm/aaaa hh:mm:ss (horário de Brasília)
  const d = br ? new Date(`${br[3]}-${br[2]}-${br[1]}T${br[4] ?? '00'}:${br[5] ?? '00'}:${br[6] ?? '00'}-03:00`) : new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}
