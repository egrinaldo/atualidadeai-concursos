import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dedupeSameStory, entities, repeatDecisions, type Published } from '../src/pdf/repeats.ts'
import { buildDoc } from '../src/pdf/model.ts'

const pub = (p: Partial<Published>): Published => ({ clusterId: 'k1', analysisId: 'a1', referenceDate: '2026-11-06', periodEnd: '2026-11-06T01:00:00Z', title: 'Câmara aprova educação em saúde com foco na família no SUS', summary: 'Projeto obriga profissionais da atenção básica a ações de educação em saúde.', ...p })
const cand = (p: Partial<{ id: string; analysis_id: string; first_seen_at: string; last_seen_at: string; title: string; summary: string }>) => ({ id: 'k1', analysis_id: 'a1', last_seen_at: '2026-11-05T14:48:00Z', title: 'Câmara aprova educação em saúde com foco na família no SUS', summary: 'Projeto obriga profissionais da atenção básica a ações de educação em saúde.', ...p })

test('repetição: assunto já publicado sem fato novo fica fora da diária seguinte (caso real 06→07/11)', () => {
  const d = repeatDecisions([cand({})], [pub({})], '2026-11-07')
  assert.deepEqual(d.get('a1'), { keep: false, reason: 'já publicado em 2026-11-06 sem fato novo' })
})

test('repetição: mesmo assunto com matérias novas, texto novo E manchete nova volta como atualização', () => {
  const upd = cand({ analysis_id: 'a2', last_seen_at: '2026-11-06T19:23:00Z', title: 'Senado aprova educação em saúde no SUS e texto vai à sanção', summary: 'Senado conclui a votação; texto segue para sanção presidencial.' })
  assert.deepEqual(repeatDecisions([upd], [pub({})], '2026-11-07').get('a2'), { keep: true, updateOf: '2026-11-06' })
  // matérias novas e texto reescrito, mas a MESMA manchete: repetição (caso real 07→08/11, Paraguai)
  const rewrite = repeatDecisions([cand({ analysis_id: 'a2', last_seen_at: '2026-11-06T19:23:00Z' })], [pub({})], '2026-11-07')
  assert.equal(rewrite.get('a2')?.keep, false)
  // matérias novas mas o MESMO texto: ainda é repetição
  const same = repeatDecisions([cand({ last_seen_at: '2026-11-06T19:23:00Z' })], [pub({})], '2026-11-07')
  assert.equal(same.get('a1')?.keep, false)
  // texto novo mas sem matéria nova depois da edição anterior (só reanálise): repetição
  const reanalysis = repeatDecisions([cand({ analysis_id: 'a3' })], [pub({})], '2026-11-07')
  assert.equal(reanalysis.get('a3')?.keep, false)
})

// Caso real 07→08/11/2026: o mesmo presidente em três agrupamentos diferentes
const PENA_PRISAO = { title: 'MP do Paraguai determina prisão de Santiago Peña após impeachment', summary: 'Ministério Público e Justiça do Paraguai solicitaram e obtiveram prisão preventiva de Santiago Peña horas após seu impeachment pelo Congresso, nesta sexta-feira (6).' }
const PENA_RENUNCIA = { title: 'Crise política e bancária no Paraguai: presidente Santiago Peña renuncia após colapso do Ueno Bank', summary: 'Em meio a crise financeira provocada pela intervenção do Banco Central do Paraguai no banco digital Ueno Bank, o presidente Santiago Peña renunciou ao cargo nesta quinta-feira (5), após abertura de processo de impeachment pela oposição.' }

test('repetição: o MESMO assunto com outras palavras (nomes próprios em comum) fica fora — Peña, 07→08/11', () => {
  const d = repeatDecisions(
    [cand({ id: 'k2', analysis_id: 'r1', first_seen_at: '2026-11-04T17:48:00Z', last_seen_at: '2026-11-08T10:33:00Z', ...PENA_RENUNCIA })],
    [pub({ clusterId: 'k1', analysisId: 'p1', referenceDate: '2026-11-07', periodEnd: '2026-11-07T01:00:00Z', ...PENA_PRISAO })],
    '2026-11-08',
  )
  assert.equal(d.get('r1')?.keep, false)
  // desdobramento que começou DEPOIS da publicação e com manchete nova: atualização
  const later = repeatDecisions(
    [cand({ id: 'k3', analysis_id: 'r2', first_seen_at: '2026-11-07T15:00:00Z', last_seen_at: '2026-11-07T20:00:00Z', title: 'Santiago Peña é extraditado do Paraguai para os Estados Unidos', summary: 'Ex-presidente Santiago Peña embarcou sob custódia rumo aos EUA.' })],
    [pub({ clusterId: 'k1', analysisId: 'p1', referenceDate: '2026-11-07', periodEnd: '2026-11-07T01:00:00Z', ...PENA_PRISAO })],
    '2026-11-08',
  )
  assert.deepEqual(later.get('r2'), { keep: true, updateOf: '2026-11-07' })
})

test('repetição: órgão em comum não liga assuntos diferentes (Prefeitura de Fortaleza, MPCE)', () => {
  const d = repeatDecisions(
    [cand({ id: 'k7', analysis_id: 'f1', first_seen_at: '2026-11-06T11:25:00Z', last_seen_at: '2026-11-07T11:06:00Z', title: 'Reforço no transporte para o primeiro dia do Enem 2026 em Fortaleza', summary: 'A Prefeitura de Fortaleza, por meio da Etufor, amplia a frota de ônibus no domingo.' }),
     cand({ id: 'k8', analysis_id: 'f2', first_seen_at: '2026-11-06T18:01:00Z', last_seen_at: '2026-11-06T18:01:00Z', title: 'MPCE participa de missão de observação eleitoral nos EUA', summary: 'O Ministério Público do Ceará (MPCE) integra missão internacional de observação.' })],
    [pub({ clusterId: 'k5', analysisId: 'x1', title: 'Prefeitura de Fortaleza firma acordo para pagamento de anuênios a mais de 7,4 mil servidores', summary: 'Acordo entre a Prefeitura de Fortaleza e o Sindifort.' }),
     pub({ clusterId: 'k6', analysisId: 'x2', title: 'MPCE promove capacitação sobre Processo Estrutural em Direito de Família', summary: 'O Ministério Público do Ceará (MPCE) realiza curso para promotores.' })],
    '2026-11-07',
  )
  assert.equal(d.get('f1')?.keep, true)
  assert.equal(d.get('f2')?.keep, true)
})

test('mesma edição: dois agrupamentos do mesmo assunto entram uma vez só (fica o mais relevante)', () => {
  const dropped = dedupeSameStory([
    { id: 'k1', analysis_id: 'a', last_seen_at: '2026-11-07T23:41:00Z', relevance_score: 70, ...PENA_PRISAO },
    { id: 'k2', analysis_id: 'b', last_seen_at: '2026-11-08T10:33:00Z', relevance_score: 80, ...PENA_RENUNCIA },
    { id: 'k3', analysis_id: 'c', last_seen_at: '2026-11-07T20:00:00Z', relevance_score: 60, title: 'Itamaraty recebe primeiros diplomatas indígenas e quilombolas', summary: 'Turma do Instituto Rio Branco.' },
  ])
  assert.deepEqual([...dropped.keys()], ['a'])
})

test('nomes próprios: tira genéricos, separa compostos e ignora siglas de órgãos', () => {
  const e = entities('Ministério Público e Justiça do Paraguai prendem o presidente Santiago Peña. O MPCE e o TCE-CE acompanham.')
  assert.ok(e.has('santiago pena') && e.has('paraguai'))
  assert.ok(!e.has('mpce') && !e.has('tce-ce') && !e.has('presidente'))
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

test('repetição: publicações antigas (fora de 5 dias) não bloqueiam por semelhança; edição do mesmo dia não conta', () => {
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
