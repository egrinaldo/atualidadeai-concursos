import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isDue, toNewsRows, type Source } from '../src/jobs/collect.ts'
import { safeFetch } from '../src/sources/fetcher.ts'
import { hostAllowed, isBlockedIp } from '../src/sources/net.ts'
import { canonicalUrl, contentFingerprint, htmlToText, parseDate } from '../src/sources/normalize.ts'
import { parseFeed, parseIbge, parseNewsSitemap } from '../src/sources/parse.ts'
import { isAllowed, parseRobots } from '../src/sources/robots.ts'

test('SSRF: IPs internos, metadados de nuvem e reservados são bloqueados', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', 'nao-e-ip'])
    assert.equal(isBlockedIp(ip), true, ip)
  for (const ip of ['8.8.8.8', '200.160.2.3', '172.32.0.1', '2804:14c::1'])
    assert.equal(isBlockedIp(ip), false, ip)
})

test('hosts permitidos: igual ou subdomínio, nunca sufixo enganoso', () => {
  assert.equal(hostAllowed('www.camara.leg.br', ['www.camara.leg.br']), true)
  assert.equal(hostAllowed('feeds.ebc.com.br', ['ebc.com.br']), true)
  assert.equal(hostAllowed('maliciosoebc.com.br', ['ebc.com.br']), false)
  assert.equal(hostAllowed('ebc.com.br.atacante.com', ['ebc.com.br']), false)
})

test('safeFetch recusa http, host fora da lista, credenciais, porta e IP interno', async () => {
  await assert.rejects(safeFetch('http://www.camara.leg.br/x', { allowedHosts: ['www.camara.leg.br'] }), /somente https/)
  await assert.rejects(safeFetch('https://outro.com/x', { allowedHosts: ['www.camara.leg.br'] }), /host não permitido/)
  await assert.rejects(safeFetch('https://u:p@www.camara.leg.br/x', { allowedHosts: ['www.camara.leg.br'] }), /credenciais/)
  await assert.rejects(safeFetch('https://www.camara.leg.br:8443/x', { allowedHosts: ['www.camara.leg.br'] }), /porta/)
  await assert.rejects(safeFetch('https://169.254.169.254/latest/meta-data', { allowedHosts: ['169.254.169.254'] }), /bloqueado/)
  await assert.rejects(safeFetch('https://[::1]/x', { allowedHosts: ['[::1]', '::1'] }), /bloqueado|não permitido/)
  await assert.rejects(safeFetch('https://localhost/x', { allowedHosts: ['localhost'], timeoutMs: 5000 }), /bloqueado/)
})

test('robots.txt: grupo correto, regra mais específica, Allow vence empate, crawl-delay', () => {
  const r = parseRobots(`User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /privado\nAllow: /privado/rss\nDisallow: /*.pdf$\nCrawl-delay: 10\n`)
  assert.equal(isAllowed(r, '/noticias/rss'), true)
  assert.equal(isAllowed(r, '/privado/pagina'), false)
  assert.equal(isAllowed(r, '/privado/rss.xml'), true)
  assert.equal(isAllowed(r, '/arquivo.pdf'), false)
  assert.equal(isAllowed(r, '/arquivo.pdf?x=1'), true)
  assert.equal(r.crawlDelaySec, 10)
  assert.equal(isAllowed(parseRobots('User-agent: *\nDisallow: /'), '/feed'), false)
  assert.equal(isAllowed(parseRobots(''), '/feed'), true)
})

const RSS = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>
<item><title><![CDATA[Senado aprova <b>PEC</b> &amp; reforma]]></title><link>https://www12.senado.leg.br/noticias/a?utm_source=rss</link>
<pubDate>Wed, 05 Nov 2026 10:00:00 -0300</pubDate><dc:creator>Agência Senado</dc:creator>
<description>&lt;p&gt;Resumo com &lt;a href="x"&gt;link&lt;/a&gt; e &amp;quot;aspas&amp;quot;&lt;/p&gt;</description>
<content:encoded><![CDATA[<p>Texto <script>alert(1)</script>completo.</p>]]></content:encoded></item>
<item><title>Sem link</title></item></channel></rss>`

test('RSS 2.0: texto puro, sem HTML/script, entidades decodificadas', () => {
  const items = parseFeed(RSS)
  assert.equal(items.length, 1)
  assert.equal(items[0].title, 'Senado aprova PEC & reforma')
  assert.equal(items[0].summary, 'Resumo com link e "aspas"')
  assert.equal(items[0].content, 'Texto completo.')
  assert.equal(items[0].author, 'Agência Senado')
  assert.equal(items[0].publishedAt?.toISOString(), '2026-11-05T13:00:00.000Z')
})

test('Atom: link alternate, id e datas', () => {
  const items = parseFeed(`<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Nota</title><id>urn:1</id><updated>2026-11-05T12:00:00Z</updated>
    <link rel="self" href="https://ex.org/self"/><link rel="alternate" href="https://ex.org/nota"/><summary>Olá</summary><author><name>OMS</name></author></entry></feed>`)
  assert.equal(items[0].url, 'https://ex.org/nota')
  assert.equal(items[0].author, 'OMS')
})

test('XML com DTD/entidades declaradas é recusado (billion laughs/XXE)', () => {
  assert.throws(() => parseFeed('<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">]><rss><channel><item><title>&lol;</title></item></channel></rss>'), /DTD/)
})

test('API do IBGE e datas no formato brasileiro', () => {
  const items = parseIbge(JSON.stringify({ items: [{ id: 1, titulo: 'PIB cresce', link: 'https://agenciadenoticias.ibge.gov.br/a.html', introducao: '<p>Texto</p>', data_publicacao: '05/11/2026 06:43:13' }, { titulo: 'sem link' }, { titulo: 'Link http', link: 'http://agenciadenoticias.ibge.gov.br/b.html', data_publicacao: '05/11/2026 07:00:00' }] }))
  assert.equal(items.length, 2)
  assert.equal(items[1].url, 'https://agenciadenoticias.ibge.gov.br/b.html')
  assert.equal(items[0].publishedAt?.toISOString(), '2026-11-05T09:43:13.000Z')
  assert.equal(parseDate('não é data'), null)
})

test('URL canônica remove rastreamento e normaliza', () => {
  assert.equal(canonicalUrl('http://WWW.Camara.leg.br/noticias/1/?utm_source=x&b=2&a=1#topo'), 'https://www.camara.leg.br/noticias/1?a=1&b=2')
  assert.equal(canonicalUrl('https://x.org/a?fbclid=1'), canonicalUrl('https://x.org/a'))
})

test('impressão do conteúdo ignora acentos, caixa e pontuação', () => {
  assert.equal(contentFingerprint('Reforma Tributária!', 'Texto  igual.'), contentFingerprint('reforma tributaria', 'texto igual'))
  assert.notEqual(contentFingerprint('A', 'x'), contentFingerprint('B', 'x'))
  assert.equal(htmlToText('<style>x</style>a<br>b'), 'a\nb')
})

const src: Source = { id: 's1', name: 'Teste', feed_url: 'https://x.org/rss', source_type: 'rss', api_kind: null, scope: 'estadual', state: 'CE', language: 'pt', default_category: 'acontecimentos_regionais', allowed_hosts: ['x.org'], fetch_interval_minutes: 180, is_active: true, last_checked_at: null, consecutive_failures: 0, http_etag: null, http_last_modified: null }

test('linhas da notícia: descarta antigas, datas futuras viram nulas, sem URL repetida, limite por fonte', () => {
  const now = new Date('2026-11-05T12:00:00Z')
  const mk = (i: number, d: string | null, url = `https://x.org/n${i}`) => ({ title: `T${i}`, url, publishedAt: d ? new Date(d) : null, summary: 's', content: '' })
  const rows = toNewsRows(src, [mk(1, '2026-11-05T10:00:00Z'), mk(2, '2026-10-01T10:00:00Z'), mk(3, '2026-11-09T10:00:00Z'), mk(4, null), mk(5, '2026-11-05T09:00:00Z', 'https://x.org/n1?utm_source=a')], now)
  assert.deepEqual(rows.map((r) => r.title).sort(), ['T1', 'T3', 'T4'])
  assert.equal(rows.find((r) => r.title === 'T3')?.published_at, null)
  assert.equal(rows[0].scope, 'estadual')
  assert.equal(rows[0].state, 'CE')
  const many = Array.from({ length: 80 }, (_, i) => mk(i + 10, '2026-11-05T10:00:00Z'))
  assert.equal(toNewsRows(src, many, now).length, 50)
})

test('agenda da fonte: intervalo normal e espera crescente após falhas (máx. 24h)', () => {
  const now = new Date('2026-11-05T12:00:00Z')
  const at = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()
  assert.equal(isDue({ ...src, last_checked_at: null }, now), true)
  assert.equal(isDue({ ...src, last_checked_at: at(3) }, now), true)
  assert.equal(isDue({ ...src, last_checked_at: at(2) }, now), false)
  assert.equal(isDue({ ...src, last_checked_at: at(5), consecutive_failures: 1 }, now), false)
  assert.equal(isDue({ ...src, last_checked_at: at(6), consecutive_failures: 1 }, now), true)
  assert.equal(isDue({ ...src, last_checked_at: at(23), consecutive_failures: 10 }, now), false)
  assert.equal(isDue({ ...src, last_checked_at: at(24), consecutive_failures: 10 }, now), true)
})

test('mapa de notícias (Google News sitemap): título, data e link; sem resumo', () => {
  const xml = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
    <url><loc>https://www.cnnbrasil.com.br/politica/a/</loc><news:news><news:publication><news:name>CNN Brasil</news:name></news:publication>
      <news:publication_date>2026-11-05T22:04:05-03:00</news:publication_date><news:title>Senado aprova &lt;b&gt;projeto&lt;/b&gt; X</news:title></news:news></url>
    <url><loc>https://www.cnnbrasil.com.br/sem-news/</loc></url>
    <url><loc>javascript:alert(1)</loc><news:news><news:title>Mal</news:title></news:news></url>
  </urlset>`
  const items = parseNewsSitemap(xml)
  assert.equal(items.length, 1)
  assert.equal(items[0].title, 'Senado aprova projeto X')
  assert.equal(items[0].publishedAt?.toISOString(), '2026-11-06T01:04:05.000Z')
  assert.equal(items[0].summary, '')
  assert.throws(() => parseNewsSitemap('<!DOCTYPE x [<!ENTITY a "b">]><urlset/>'))
})

test('modo resumo (veículos de imprensa): nunca guarda o texto da matéria, só resumo curto', () => {
  const now = new Date('2026-11-05T12:00:00Z')
  const longo = 'Frase da matéria. '.repeat(300)
  const item = { title: 'Fato', url: 'https://x.org/a', publishedAt: new Date('2026-11-05T10:00:00Z'), summary: '', content: longo }
  const [r] = toNewsRows({ ...src, content_mode: 'summary' }, [item], now)
  assert.equal(r.original_content, null)
  assert.ok(r.excerpt!.length <= 401, String(r.excerpt!.length))
  const [full] = toNewsRows(src, [item], now) // fontes públicas continuam guardando o texto (apagado em 30 dias)
  assert.ok((full.original_content ?? '').length > 1000)
})
