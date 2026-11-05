import { XMLParser } from 'fast-xml-parser'
import { htmlToText, parseDate } from './normalize.ts'

export type RawItem = {
  title: string
  url: string
  guid?: string
  publishedAt: Date | null
  author?: string
  summary: string // texto puro
  content: string // texto puro (quando o feed traz o conteúdo)
}

const asArray = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v])
const text = (v: unknown): string => {
  if (v == null) return ''
  if (typeof v === 'string' || typeof v === 'number') return String(v)
  if (typeof v === 'object' && '#text' in (v as object)) return String((v as Record<string, unknown>)['#text'] ?? '')
  return ''
}

/**
 * Lê RSS 2.0, RSS 1.0 (RDF) e Atom. Documentos com DTD/entidades declaradas
 * são recusados (proteção contra "billion laughs" / XXE).
 */
export function parseFeed(xml: string): RawItem[] {
  if (/<!DOCTYPE[^>]*\[|<!ENTITY/i.test(xml.slice(0, 5000))) throw new Error('feed com DTD/entidades declaradas recusado')
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    processEntities: false, // decodificamos só entidades padrão em htmlToText
    htmlEntities: false,
    trimValues: true,
    parseTagValue: false,
    isArray: (name) => ['item', 'entry', 'link'].includes(name),
  })
  const doc = parser.parse(xml)
  const items: RawItem[] = []

  const rssItems = asArray(doc?.rss?.channel?.item).concat(asArray(doc?.['rdf:RDF']?.item))
  for (const it of rssItems as Record<string, unknown>[]) {
    const link = asArray(it.link as unknown).map(text).find((l) => /^https?:\/\//.test(l.trim()))
    const guid = text(it.guid)
    const url = (link || (/^https?:\/\//.test(guid) ? guid : '')).trim()
    if (!url) continue
    items.push({
      title: htmlToText(text(it.title)),
      url,
      guid: guid || undefined,
      publishedAt: parseDate(text(it.pubDate) || text(it['dc:date'])),
      author: htmlToText(text(it['dc:creator']) || text(it.author)) || undefined,
      summary: htmlToText(text(it.description)),
      content: htmlToText(text(it['content:encoded'])),
    })
  }

  for (const e of asArray(doc?.feed?.entry) as Record<string, unknown>[]) {
    const links = asArray(e.link as unknown) as Record<string, string>[]
    const alt = links.find((l) => typeof l === 'object' && (l['@rel'] ?? 'alternate') === 'alternate') ?? links[0]
    const url = (typeof alt === 'object' ? alt?.['@href'] : text(alt)) ?? ''
    if (!/^https?:\/\//.test(url)) continue
    const author = e.author as Record<string, unknown> | undefined
    items.push({
      title: htmlToText(text(e.title)),
      url,
      guid: text(e.id) || undefined,
      publishedAt: parseDate(text(e.published) || text(e.updated)),
      author: htmlToText(text(author?.name)) || undefined,
      summary: htmlToText(text(e.summary)),
      content: htmlToText(text(e.content)),
    })
  }
  return items.filter((i) => i.title.length > 0)
}

/** API de notícias do IBGE (servicodados.ibge.gov.br/api/v3/noticias). */
export function parseIbge(json: string): RawItem[] {
  const data = JSON.parse(json) as { items?: Record<string, unknown>[] }
  return asArray(data.items).flatMap((it) => {
    // A API devolve links em http://; o site do IBGE responde em https
    const url = String(it.link ?? '').replace(/^http:\/\//, 'https://')
    if (!/^https:\/\//.test(url)) return []
    return [{
      title: htmlToText(String(it.titulo ?? '')),
      url,
      guid: it.id != null ? String(it.id) : undefined,
      publishedAt: parseDate(it.data_publicacao),
      summary: htmlToText(String(it.introducao ?? '')),
      content: '',
    }]
  }).filter((i) => i.title.length > 0)
}
