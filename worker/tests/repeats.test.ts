import assert from 'node:assert/strict'
import { test } from 'node:test'
import { repeatDecisions, type Published } from '../src/pdf/repeats.ts'
import { buildDoc } from '../src/pdf/model.ts'

const pub = (p: Partial<Published>): Published => ({ clusterId: 'k1', analysisId: 'a1', referenceDate: '2026-11-06', periodEnd: '2026-11-06T01:00:00Z', title: 'Câmara aprova educação em saúde com foco na família no SUS', summary: 'Projeto obriga profissionais da atenção básica a ações de educação em saúde.', ...p })
const cand = (p: Partial<{ id: string; analysis_id: string; last_seen_at: string; title: string; summary: string }>) => ({ id: 'k1', analysis_id: 'a1', last_seen_at: '2026-11-05T14:48:00Z', title: 'Câmara aprova educação em saúde com foco na família no SUS', summary: 'Projeto obriga profissionais da atenção básica a ações de educação em saúde.', ...p })

test('repetição: assunto já publicado sem fato novo fica fora da diária seguinte (caso real 06→07/11)', () => {
  const d = repeatDecisions([cand({})], [pub({})], '2026-11-07')
  assert.deepEqual(d.get('a1'), { keep: false, reason: 'já publicado em 2026-11-06 sem fato novo' })
})

test('repetição: mesmo assunto com matérias novas E texto novo volta como atualização', () => {
  const d = repeatDecisions([cand({ analysis_id: 'a2', last_seen_at: '2026-11-06T19:23:00Z' })], [pub({})], '2026-11-07')
  assert.deepEqual(d.get('a2'), { keep: true, updateOf: '2026-11-06' })
  // matérias novas mas o MESMO texto: ainda é repetição
  const same = repeatDecisions([cand({ last_seen_at: '2026-11-06T19:23:00Z' })], [pub({})], '2026-11-07')
  assert.equal(same.get('a1')?.keep, false)
  // texto novo mas sem matéria nova depois da edição anterior (só reanálise): repetição
  const reanalysis = repeatDecisions([cand({ analysis_id: 'a3' })], [pub({})], '2026-11-07')
  assert.equal(reanalysis.get('a3')?.keep, false)
})

test('repetição: o mesmo fato em OUTRO agrupamento (título quase igual) também fica fora; assunto novo entra', () => {
  const d = repeatDecisions(
    [cand({ id: 'k9', analysis_id: 'b1', last_seen_at: '2026-11-06T10:00:00Z', title: 'Câmara aprova educação em saúde com foco na família no SUS', summary: 'Proposta obriga profissionais da atenção básica a promover educação em saúde.' }),
     cand({ id: 'k8', analysis_id: 'b2', last_seen_at: '2026-11-06T10:00:00Z', title: 'EUA criam 165 mil vagas de trabalho em outubro', summary: 'Taxa de desemprego cai para 4,1%.' })],
    [pub({}), pub({ clusterId: 'k5', analysisId: 'x', title: 'Copom mantém Selic em 13,75%', summary: 'Juros mantidos.' })],
    '2026-11-07',
  )
  assert.equal(d.get('b1')?.keep, false)
  assert.deepEqual(d.get('b2'), { keep: true, updateOf: null })
})

test('repetição: publicações antigas (fora de 3 dias) não bloqueiam por semelhança; edição do mesmo dia não conta', () => {
  const old = repeatDecisions([cand({ id: 'k9', analysis_id: 'b1' })], [pub({ referenceDate: '2026-10-30' })], '2026-11-07')
  assert.equal(old.get('b1')?.keep, true)
  const sameDay = repeatDecisions([cand({})], [pub({ referenceDate: '2026-11-07' })], '2026-11-07')
  assert.equal(sameDay.get('a1')?.keep, true) // recompor a própria edição não se autoexclui
})

test('PDF: item de atualização mostra o selo com a data da publicação anterior', () => {
  const row = { category: 'politica', verification_status: 'corroborada', source_count: 2, editorial_title: 'T', summary: 'S', what_happened: 'W', context: null, historical_background: null, political_analysis: null, economic_analysis: null, social_impact: null, why_it_matters: 'I', consequences: null, relevance_for_exams: 'R', possible_exam_topics: [], memorize: [], exam_approaches: [], questions: [], refs: [{ url: 'https://x.gov.br', source: 'X', title: null, official: true }], audit_status: 'aprovada', update_of: '2026-11-06' }
  const doc = buildDoc({ type: 'diaria', state: 'CE', referenceDate: '2026-11-07', periodStart: '2026-11-06T01:00:00Z', periodEnd: '2026-11-07T01:00:00Z' }, { estado: [], nacional: [row], internacional: [] })
  assert.equal(doc.blocks[1].items[0].followUp, 'Atualização — assunto publicado em 06/11, com fatos novos')
})
