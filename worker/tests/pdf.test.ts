import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PDFDocument } from 'pdf-lib'
import { basePdfPath, editionTypesFor, editionWindow, referenceDateFor, selectEditionItems, type EditionCandidate } from '../src/pdf/edition.ts'
import { buildDoc, verificationBadge, type SourceRow } from '../src/pdf/model.ts'
import { qaEdition } from '../src/pdf/qa.ts'
import { bodyHtml, coverHtml, esc } from '../src/pdf/template.ts'

const row = (title: string, p: Partial<SourceRow> = {}): SourceRow => ({
  category: 'economia', verification_status: 'corroborada', source_count: 2, editorial_title: title, summary: 'Resumo.', what_happened: 'Fato.',
  context: null, historical_background: '', political_analysis: null, economic_analysis: 'Análise.', social_impact: null, why_it_matters: 'Importa.',
  consequences: { confirmados: ['a'], projecoes: ['b'] }, relevance_for_exams: 'Cai em prova.', possible_exam_topics: ['Economia'], memorize: ['x'],
  exam_approaches: ['y'], questions: [{ enunciado: 'Q?', alternativas: { B: 'b', A: 'a', C: 'c', D: 'd', E: 'e' }, gabarito: 'A', comentario: 'Porque sim.' }],
  refs: [{ url: 'https://ibge.gov.br/n', source: 'IBGE', title: 'T', official: true }, { url: 'javascript:alert(1)', source: 'X', title: null, official: false }],
  audit_status: 'aprovada',
  ...p,
})
const meta = { type: 'diaria' as const, state: 'CE', referenceDate: '2026-11-06', periodStart: '2026-11-05T01:00:00.000Z', periodEnd: '2026-11-06T01:00:00.000Z' }

test('PDF: escapa HTML e descarta links que não são http(s)', () => {
  assert.equal(esc('<script>"x"&\''), '&lt;script&gt;&quot;x&quot;&amp;&#39;')
  const doc = buildDoc(meta, { estado: [row('<b>Fortaleza</b>')], nacional: [], internacional: [] })
  const html = bodyHtml(doc, '')
  assert.ok(!html.includes('<b>Fortaleza</b>') && html.includes('&lt;b&gt;Fortaleza&lt;/b&gt;'))
  assert.ok(!html.includes('javascript:'))
  assert.deepEqual(doc.blocks[0].items[0].references.map((r) => r.source), ['IBGE'])
})

test('PDF: ordem Estado → Nacional → Internacional, numeração contínua de assuntos e questões', () => {
  const doc = buildDoc(meta, { internacional: [row('Mundo')], estado: [row('CE 1'), row('CE 2')], nacional: [row('Brasil')] })
  assert.deepEqual(doc.blocks.map((b) => b.key), ['estado', 'nacional', 'internacional'])
  assert.deepEqual(doc.blocks.flatMap((b) => b.items.map((i) => `${i.n}:${i.title}`)), ['1:CE 1', '2:CE 2', '3:Brasil', '4:Mundo'])
  assert.deepEqual(doc.blocks.flatMap((b) => b.items.flatMap((i) => i.questions.map((q) => q.n))), [1, 2, 3, 4])
  assert.deepEqual(doc.blocks[0].items[0].questions[0].alternatives.map((a) => a.letter), ['A', 'B', 'C', 'D', 'E'])
  assert.equal(doc.blocks[0].title, 'Ceará')
  const cover = coverHtml(doc, '')
  assert.match(cover, /4<\/div><div class="l">assuntos selecionados/)
})

test('PDF: selos de verificação', () => {
  assert.equal(verificationBadge('corroborada', 3, true).label, 'Confirmada por 3 fontes independentes')
  assert.equal(verificationBadge('parcialmente_corroborada', 1, true).label, 'Fonte oficial')
  assert.equal(verificationBadge('nao_confirmada', 1, false).tone, 'warn')
})

test('calendário: data da edição, tipos do dia e janelas (Brasília, fechamento 22h)', () => {
  assert.equal(referenceDateFor(new Date('2026-11-06T01:10:00Z')), '2026-11-06') // 22h10 de 05/11 em Brasília → edição de 06/11
  assert.equal(referenceDateFor(new Date('2026-11-06T10:00:00Z')), '2026-11-06') // 07h de 06/11 → mesma data
  assert.equal(referenceDateFor(new Date('2026-11-06T16:00:00Z')), '2026-11-07') // 13h de 06/11 → próxima edição
  assert.deepEqual(editionTypesFor('2026-11-06'), ['diaria'])
  assert.deepEqual(editionTypesFor('2026-11-09'), ['diaria', 'semanal']) // segunda-feira
  assert.deepEqual(editionTypesFor('2026-12-01'), ['diaria', 'mensal'])
  assert.deepEqual(editionWindow('diaria', '2026-11-06'), { start: '2026-11-05T01:00:00.000Z', end: '2026-11-06T01:00:00.000Z' })
  assert.equal(editionWindow('semanal', '2026-11-09').start, '2026-11-02T01:00:00.000Z')
  assert.deepEqual(editionWindow('mensal', '2026-12-01'), { start: '2026-11-01T01:00:00.000Z', end: '2026-12-01T01:00:00.000Z' })
  assert.equal(basePdfPath('diaria', 'CE', '2026-11-06', 2), 'base/diaria/CE/2026-11-06/v2.pdf')
})

const cand = (id: string, p: Partial<EditionCandidate>): EditionCandidate => ({
  id, analysis_id: `a-${id}`, scope: 'nacional', state: null, relevance: 'alta', relevance_score: 60, verification_status: 'corroborada',
  needs_review: false, best_reliability: 5, source_count: 2, last_seen_at: '2026-11-05T20:00:00Z', ...p,
})

test('seleção da edição: janela, elegibilidade e limite por bloco', () => {
  const sel = selectEditionItems(
    [
      cand('n1', { relevance_score: 90 }), cand('n2', { relevance_score: 80 }), cand('n3', { relevance_score: 70 }),
      cand('velho', { relevance_score: 99, last_seen_at: '2026-11-01T00:00:00Z' }),
      cand('revisar', { relevance_score: 99, needs_review: true }),
      cand('ce', { scope: 'estadual', state: 'CE' }), cand('sp', { scope: 'estadual', state: 'SP' }),
      cand('mundo', { scope: 'internacional', last_seen_at: '2026-11-04T16:00:00Z' }), // dentro da tolerância de 12h
    ],
    { pilotStates: ['CE'], state: 'CE', minRelevance: 'media', editionStatuses: ['corroborada'], singleSourceMinReliability: 4, perBlock: { estado: 5, nacional: 2, internacional: 4 },
      window: { start: '2026-11-05T01:00:00Z', end: '2026-11-06T01:00:00Z' }, graceHours: 12 },
  )
  assert.deepEqual(sel.nacional.map((c) => c.id), ['n1', 'n2'])
  assert.deepEqual(sel.estado.map((c) => c.id), ['ce'])
  assert.deepEqual(sel.internacional.map((c) => c.id), ['mundo'])
})

test('controle de qualidade: reprova texto quebrado, e-mail pessoal e edição vazia', async () => {
  const pdf = await PDFDocument.create()
  pdf.addPage(); pdf.addPage(); pdf.setTitle('t')
  const bytes = await pdf.save()
  const doc = buildDoc(meta, { estado: [row('A')], nacional: [row('B')], internacional: [row('C')] })
  const ok = await qaEdition(doc, { cover: coverHtml(doc, ''), body: bodyHtml(doc, '') }, bytes)
  assert.deepEqual(ok.errors, [])
  const bad = await qaEdition(doc, { cover: '<p>undefined</p>', body: '<p>fulano@exemplo.com</p>' }, bytes)
  assert.equal(bad.passed, false)
  assert.equal(bad.errors.length, 2)
  // Trava da auditoria: item sem auditoria aprovada reprova o PDF
  const docPend = buildDoc(meta, { estado: [row('A', { audit_status: 'reprovada' })], nacional: [row('B'), row('C')], internacional: [] })
  const pend = await qaEdition(docPend, { cover: coverHtml(docPend, ''), body: bodyHtml(docPend, '') }, bytes)
  assert.ok(pend.errors.some((e) => /auditoria de veracidade/.test(e)))
  const vazio = await qaEdition(buildDoc(meta, { estado: [], nacional: [], internacional: [] }), { cover: '', body: '' }, bytes)
  assert.ok(vazio.errors.some((e) => e.startsWith('poucos assuntos')))
})

test('renderização real (Chromium): gera PDF com capa + miolo e passa no controle de qualidade', async (t) => {
  let chromium
  try {
    ;({ chromium } = await import('playwright'))
    await (await chromium.launch()).close()
  } catch {
    t.skip('Chromium não instalado neste ambiente')
    return
  }
  const { renderEditionPdf } = await import('../src/pdf/render.ts')
  const doc = buildDoc(meta, { estado: [row('Fortaleza amplia postos')], nacional: [row('Selic')], internacional: [row('ONU')] })
  const out = await renderEditionPdf(doc)
  assert.ok(out.pageCount >= 2)
  const qa = await qaEdition(doc, out.html, out.bytes)
  assert.deepEqual(qa.errors, [])
})
