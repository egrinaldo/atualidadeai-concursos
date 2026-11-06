import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planStory } from '../src/period/plan.ts'
import { addDays, coverage, dedupeEntries, groupStories, selectStories, weekDates, type Entry } from '../src/period/stories.ts'
import { mergeReferences, synthesisHash, synthesisInput, validateSynthesis } from '../src/period/synthesis.ts'
import { buildDoc, type SourceRow } from '../src/pdf/model.ts'
import { bodyHtml } from '../src/pdf/template.ts'

let seq = 0
const entry = (p: Partial<Entry>): Entry => ({
  analysisId: `a${++seq}`, kind: 'analise', clusterIds: [`c${seq}`], block: 'nacional', dates: ['2026-11-03'], score: 60, sourceCount: 2,
  title: 'Título', summary: 'Resumo.', whatHappened: 'Fato.', memorize: [], confirmed: [], references: [{ url: `https://ex.gov.br/${seq}`, source: 'Ex', official: true }],
  auditStatus: 'aprovada', generatedAt: `2026-11-0${(seq % 9) + 1}T10:00:00Z`, ...p,
})

test('período: cobertura da semanal (W−6…W) e da mensal (mês anterior, pelas datas das diárias)', () => {
  assert.deepEqual(coverage('semanal', '2026-11-09'), { from: '2026-11-03', to: '2026-11-09' })
  assert.deepEqual(coverage('mensal', '2026-12-01'), { from: '2026-11-02', to: '2026-12-01' })
  assert.deepEqual(coverage('mensal', '2027-01-01'), { from: '2026-12-02', to: '2027-01-01' })
  assert.equal(weekDates('2026-11-09').length, 7)
  assert.equal(weekDates('2026-11-09')[0], '2026-11-03')
  assert.equal(addDays('2026-02-28', 1), '2026-03-01')
})

test('período: o mesmo texto em várias diárias vira uma entrada com todas as datas', () => {
  const e = entry({ analysisId: 'x', dates: ['2026-11-04'] })
  const d = dedupeEntries([e, { ...e, dates: ['2026-11-03'] }])
  assert.equal(d.length, 1)
  assert.deepEqual(d[0].dates, ['2026-11-03', '2026-11-04'])
})

test('período: agrupa o mesmo assunto em dias diferentes (cluster comum ou texto parecido) e separa os diferentes', () => {
  const a = entry({ clusterIds: ['k1'], title: 'Câmara do Paraguai abre processo de impeachment contra Santiago Peña', summary: 'Oposição pede impeachment de Peña após colapso do Ueno Bank.', dates: ['2026-11-04'] })
  const b = entry({ clusterIds: ['k2'], title: 'Santiago Peña renuncia à Presidência do Paraguai em meio a impeachment', summary: 'Peña renuncia após colapso do Ueno Bank; vice assume.', dates: ['2026-11-06'], score: 80 })
  const c = entry({ clusterIds: ['k1', 'k3'], title: 'Senado paraguaio julga impeachment', summary: 'Julgamento retomado.', dates: ['2026-11-07'] })
  const d = entry({ clusterIds: ['k9'], title: 'Copom mantém a taxa Selic', summary: 'Banco Central mantém juros.', dates: ['2026-11-05'] })
  const e = entry({ clusterIds: ['k10'], block: 'internacional', title: 'Santiago Peña renuncia à Presidência do Paraguai', summary: 'Peña renuncia; vice assume.', dates: ['2026-11-06'] })
  const stories = groupStories([a, b, c, d, e], 0.4)
  const pena = stories.find((s) => s.entries.length === 3)!
  assert.ok(pena, 'história do Paraguai com 3 textos')
  assert.deepEqual(pena.dates, ['2026-11-04', '2026-11-06', '2026-11-07'])
  assert.deepEqual(pena.entries.map((x) => x.dates[0]), ['2026-11-04', '2026-11-06', '2026-11-07']) // ordem cronológica
  assert.ok(stories.some((s) => s.entries.length === 1 && s.entries[0].analysisId === d.analysisId))
  assert.ok(stories.some((s) => s.block === 'internacional' && s.entries.length === 1), 'outro bloco não se mistura pela semelhança')
  // Mais dias = mais peso que um assunto isolado de nota maior
  assert.ok(pena.score > 80)
})

test('período: escolhe as histórias de maior peso por bloco; um texto só reaproveita, vários pedem síntese', () => {
  const s1 = groupStories([entry({ score: 90, block: 'estado' }), entry({ score: 50, block: 'estado', title: 'Outro assunto bem diferente', summary: 'Nada a ver.' })])
  const sel = selectStories(s1, { estado: 1, nacional: 0, internacional: 0 })
  assert.equal(sel.estado.length, 1)
  assert.equal(sel.estado[0].entries[0].score, 90)
  assert.equal(planStory(sel.estado[0], 'sintese_semanal').reuse, sel.estado[0].entries[0].analysisId)
  const multi = groupStories([entry({ clusterIds: ['z'] }), entry({ clusterIds: ['z'], dates: ['2026-11-05'] })])[0]
  const plan = planStory(multi, 'sintese_semanal')
  assert.equal(plan.reuse, null)
  assert.match(plan.hash!, /^[a-f0-9]{64}$/)
  assert.notEqual(plan.hash, synthesisHash('sintese_mensal', multi))
})

test('síntese: fontes são os textos anteriores com a data dos fatos; referências unidas sem repetir', () => {
  const s = groupStories([
    entry({ clusterIds: ['p'], dates: ['2026-11-04'], summary: 'Câmara abre processo contra 3 ministros.', references: [{ url: 'https://a.gov.br', source: 'A', official: true }] }),
    entry({ clusterIds: ['p'], dates: ['2026-11-06'], summary: 'Senado julga.', references: [{ url: 'https://a.gov.br', source: 'A', official: true }, { url: 'https://b.com', source: 'B', official: false }] }),
  ])[0]
  const input = synthesisInput(s, null)
  assert.equal(input.sources.length, 2)
  assert.equal(input.sources[0].published_at?.slice(0, 10), '2026-11-03')
  assert.equal(input.sources[0].source, 'Informativo diário — fatos de 03/11')
  assert.equal(mergeReferences(s).length, 2)
})

const good = {
  titulo_editorial: 'Crise no Paraguai: da abertura do impeachment à renúncia', resumo: 'A Câmara abriu processo contra 3 ministros e o Senado julgou o caso.',
  o_que_aconteceu: 'Em 03/11 a Câmara abriu processo contra 3 ministros; em 05/11 o Senado julgou.',
  linha_do_tempo: [{ data: '03/11', fato: 'Câmara abre processo contra 3 ministros' }, { data: '05/11', fato: 'Senado julga o caso' }],
  contexto: '', antecedentes: '', analise_politica: '', analise_economica: '', impacto_social: '', por_que_importa: 'Mostra o funcionamento do impeachment.',
  consequencias: { confirmadas: [], projecoes: [] }, relevancia_para_concursos: 'Relações internacionais e América do Sul.', temas_de_prova: ['Mercosul', 'Política externa'],
  memorizar: ['Processo contra 3 ministros', 'Julgamento no Senado'], abordagens_em_prova: ['Linha do tempo'],
  questoes: [{ enunciado: 'Qual casa julgou o processo?', alternativas: { A: 'Senado', B: 'Câmara', C: 'STF', D: 'Executivo', E: 'Tribunal eleitoral' }, gabarito: 'A', comentario: 'Foi o Senado.' }],
  referencias: [],
}

test('síntese: valida linha do tempo (datas e números das fontes) e permite repetir nossos próprios textos', () => {
  const s = groupStories([
    entry({ clusterIds: ['q'], dates: ['2026-11-04'], summary: 'A Câmara abriu processo contra 3 ministros.', whatHappened: 'Em 03/11 a Câmara abriu processo contra 3 ministros.' }),
    entry({ clusterIds: ['q'], dates: ['2026-11-06'], summary: 'O Senado julgou o caso.' }),
  ])[0]
  const input = synthesisInput(s, null)
  const ok = validateSynthesis(JSON.stringify(good), input)
  assert.ok(ok.ok, JSON.stringify(ok))
  if (ok.ok) assert.equal(ok.timeline.length, 2)
  const badDate = validateSynthesis(JSON.stringify({ ...good, linha_do_tempo: [{ data: '03/11', fato: 'x abc' }, { data: '29/11', fato: 'Senado julga' }] }), input)
  assert.ok(!badDate.ok && badDate.errors.some((e) => /29\/11/.test(e)))
  // Data da EDIÇÃO (06/11) em vez da data dos fatos (05/11) é recusada
  const editionDate = validateSynthesis(JSON.stringify({ ...good, linha_do_tempo: [good.linha_do_tempo[0], { data: '06/11', fato: 'Senado julga o caso' }] }), input)
  assert.ok(!editionDate.ok && editionDate.errors.some((e) => /06\/11/.test(e)))
  const badNum = validateSynthesis(JSON.stringify({ ...good, linha_do_tempo: [{ data: '03/11', fato: 'processo contra 47 ministros' }, good.linha_do_tempo[1]] }), input)
  assert.ok(!badNum.ok && badNum.errors.some((e) => /47/.test(e)))
  const noTl = validateSynthesis(JSON.stringify({ ...good, linha_do_tempo: [] }), input)
  assert.ok(!noTl.ok)
})

const row = (p: Partial<SourceRow> = {}): SourceRow => ({
  category: 'economia', verification_status: 'corroborada', source_count: 2, editorial_title: 'T', summary: 'S', what_happened: 'W', context: null, historical_background: null,
  political_analysis: null, economic_analysis: null, social_impact: null, why_it_matters: 'I', consequences: null, relevance_for_exams: 'R', possible_exam_topics: [], memorize: [],
  exam_approaches: [], questions: [], refs: [{ url: 'https://x.gov.br', source: 'X', title: null, official: true }], audit_status: 'aprovada', ...p,
})

test('PDF: síntese mostra linha do tempo e acompanhamento; item leva a situação da auditoria', () => {
  const doc = buildDoc({ type: 'semanal', state: 'CE', referenceDate: '2026-11-09', periodStart: '2026-11-02T01:00:00Z', periodEnd: '2026-11-09T01:00:00Z' }, {
    estado: [], internacional: [],
    nacional: [row({ period_meta: { dates: ['2026-11-04', '2026-11-06'], timeline: [{ data: '03/11', fato: 'Abertura <b>' }, { data: '05/11', fato: 'Renúncia' }] } }), row({ audit_status: undefined })],
  })
  const [a, b] = doc.blocks[1].items
  assert.equal(a.followUp, 'Acompanhado em 2 edições diárias (04/11 a 06/11)')
  assert.equal(a.timeline.length, 2)
  assert.equal(b.audit, 'pendente')
  const html = bodyHtml(doc, '')
  assert.match(html, /Linha do tempo/)
  assert.match(html, /Abertura &lt;b&gt;/)
})
