/**
 * Testes da validação do painel editorial (sem rede).
 * Executar:  npm run test:functions
 */
import { providerBusy } from '../_shared/http.ts'
import { cleanText, EDITION_TRANSITIONS, publicHttpsUrl, validateAnalysisEdit, validateNewSource, validateSetting } from '../editorial/validate.ts'

function assert(cond: unknown, msg = 'falhou') {
  if (!cond) throw new Error(msg)
}
function assertEquals<T>(actual: T, expected: T, msg = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${msg} esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`)
}

Deno.test('texto: remove caracteres de controle, normaliza espaços e respeita limites', () => {
  const r = cleanText('  Olá\u0000   mundo\u0007  ', 3, 20, 'Campo')
  assertEquals(r, { ok: true, value: 'Olá mundo' })
  assert(!cleanText('ab', 3, 20, 'Campo').ok)
  assert(!cleanText('x'.repeat(21), 3, 20, 'Campo').ok)
  assert(!cleanText(123, 3, 20, 'Campo').ok)
})

Deno.test('edição de análise: só campos permitidos, com limites; "Para memorizar" de 1 a 8 itens', () => {
  const ok = validateAnalysisEdit({ editorial_title: 'Copom mantém a Selic em 13,75%', memorize: ['Selic em 13,75%'], questions: 'ignorado' })
  assert(ok.ok)
  if (ok.ok) {
    assertEquals(Object.keys(ok.value.fields), ['editorial_title'])
    assertEquals(ok.value.memorize, ['Selic em 13,75%'])
  }
  assert(!validateAnalysisEdit({ summary: 'curto' }).ok)
  assert(!validateAnalysisEdit({ memorize: [] }).ok)
  assert(!validateAnalysisEdit({ memorize: Array(9).fill('item válido') }).ok)
  assert(!validateAnalysisEdit({}).ok)
  assert(!validateAnalysisEdit(null).ok)
})

Deno.test('fonte: só https público — recusa http, IP, localhost, credenciais e porta', () => {
  for (const bad of ['http://site.com/rss', 'https://127.0.0.1/rss', 'https://[::1]/rss', 'https://localhost/rss', 'https://intranet/rss', 'https://x.local/rss', 'https://u:p@site.com/rss', 'https://site.com:8443/rss', 'javascript:alert(1)'])
    assert(!publicHttpsUrl(bad, 'Feed').ok, bad)
  assert(publicHttpsUrl('https://g1.globo.com/rss/g1/', 'Feed').ok)
})

const fonte = { name: 'Diário Exemplo', feed_url: 'https://www.exemplo.com.br/feed/', source_type: 'rss', scope: 'estadual', state: 'ce', reliability_level: 3, terms_notes: 'robots.txt permite /feed; termos lidos em 06/11/2026, sem proibição de robôs.' }

Deno.test('fonte: cadastro válido vira modo resumo com allowed_hosts = só o host do feed', () => {
  const r = validateNewSource(fonte)
  assert(r.ok, JSON.stringify(r))
  if (r.ok) {
    assertEquals(r.value.allowed_hosts, ['www.exemplo.com.br'])
    assertEquals(r.value.state, 'CE')
    assertEquals(r.value.content_mode, 'summary')
    assertEquals(r.value.website, 'https://www.exemplo.com.br/')
  }
  // Modo completo só para fonte oficial que pediu
  const oficial = validateNewSource({ ...fonte, is_primary: true, content_mode: 'full' })
  assert(oficial.ok && oficial.value.content_mode === 'full')
  const imprensa = validateNewSource({ ...fonte, content_mode: 'full' })
  assert(imprensa.ok && imprensa.value.content_mode === 'summary')
})

Deno.test('fonte: exige UF válida, tipo, confiabilidade 1–5 e registro dos termos de uso', () => {
  assert(!validateNewSource({ ...fonte, state: 'XX' }).ok)
  assert(!validateNewSource({ ...fonte, source_type: 'html' }).ok) // raspagem de página não é permitida pelo painel
  assert(!validateNewSource({ ...fonte, reliability_level: 7 }).ok)
  assert(!validateNewSource({ ...fonte, terms_notes: 'ok' }).ok)
  assert(!validateNewSource({ ...fonte, default_category: 'fofoca' }).ok)
})

Deno.test('configurações: lista fechada e validação de cada valor', () => {
  assert(validateSetting('ai.daily_call_budget', 80).ok)
  assert(!validateSetting('ai.daily_call_budget', 9999).ok)
  assert(!validateSetting('ai.daily_call_budget', '80').ok)
  assert(!validateSetting('pipeline.pilot_states', ['CE', 'SP']).ok) // fora da lista do painel
  assert(validateSetting('triage.similarity_threshold', 0.4).ok)
  assert(!validateSetting('triage.similarity_threshold', 0.95).ok)
  assert(validateSetting('verification.edition_statuses', ['corroborada', 'parcialmente_corroborada']).ok)
  assert(!validateSetting('verification.edition_statuses', ['contradita']).ok)
  assert(validateSetting('edition.items_per_block', { diaria: { estado: 5, nacional: 6, internacional: 4 }, semanal: { estado: 8, nacional: 10, internacional: 6 }, mensal: { estado: 10, nacional: 14, internacional: 8 } }).ok)
  assert(!validateSetting('edition.items_per_block', { diaria: { estado: 5 } }).ok)
  assert(validateSetting('audit.enabled', false).ok)
  assert(!validateSetting('audit.enabled', 'false').ok)
  assert(validateSetting('audit.max_per_run', 8).ok)
  assert(!validateSetting('audit.max_per_run', 0).ok)
  assert(validateSetting('synthesis.similarity_threshold', 0.4).ok)
  assert(!validateSetting('synthesis.similarity_threshold', 0.1).ok)
  assert(validateSetting('review.auto', true).ok)
  assert(!validateSetting('review.max_reanalysis', 5).ok)
  assert(!validateSetting('ai.analysis_per_block', { estado: 5, nacional: 6, internacional: 4, extra: 1 }).ok)
})

Deno.test('edições: transições permitidas ao editor', () => {
  assert(EDITION_TRANSITIONS.approve.includes('in_review'))
  assert(!EDITION_TRANSITIONS.approve.includes('published'))
  assert(EDITION_TRANSITIONS.regenerate.includes('generated'))
  assert(!EDITION_TRANSITIONS.hold.includes('published'))
})

Deno.test('Mercado Pago 429 vira 503 com Retry-After e mensagem clara', async () => {
  const r = providerBusy()
  assert(r.status === 503)
  assert(r.headers.get('Retry-After') === '30')
  assert(/muitos pedidos/.test((await r.json()).error))
})
