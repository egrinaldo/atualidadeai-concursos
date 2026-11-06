import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aiClient, startOfDayBrasilia, type UsageRow, type UsageStore } from '../src/ai/client.ts'
import { nvidiaProvider, stripReasoning } from '../src/ai/nvidia.ts'
import { AIError, type AIProvider, type ChatRequest } from '../src/ai/types.ts'
import { generateAnalysis, toAnalysisRow } from '../src/analysis/generate.ts'
import { buildInput, buildMessages, inputHash, type AnalysisInput } from '../src/analysis/prompt.ts'
import { selectForAnalysis, type Candidate, type SelectionPolicy } from '../src/analysis/select.ts'
import { numbersIn, unaccentedWords, validateAnalysis } from '../src/analysis/validate.ts'

const input: AnalysisInput = buildInput(
  { block: 'nacional', state: null, category: 'economia', verification: { status: 'corroborada', independent_sources: 2, summary: '2 fontes.' } },
  [
    { source: 'IBGE', official: true, title: 'Produção industrial recua 0,8% em setembro', url: 'https://agenciadenoticias.ibge.gov.br/n1', published_at: '2026-11-05T12:00:00Z', text: 'A produção industrial recuou 0,8% em setembro, quarta queda em cinco meses. No ano, acumula alta de 0,4%.' },
    { source: 'Agência Brasil', official: false, title: 'Indústria recua 0,8%', url: 'https://agenciabrasil.ebc.com.br/n2', published_at: '2026-11-05T13:00:00Z', text: 'Segundo o IBGE, a indústria recuou 0,8%.' },
  ],
)
const good = {
  titulo_editorial: 'Produção industrial recua 0,8% em setembro',
  resumo: 'A produção industrial caiu 0,8% em setembro, segundo o IBGE.',
  o_que_aconteceu: 'O IBGE divulgou em 5 de novembro de 2026 que a produção recuou 0,8%.',
  contexto: 'É a quarta queda em cinco meses.',
  antecedentes: '',
  analise_politica: '',
  analise_economica: 'No ano, a indústria acumula alta de 0,4%.',
  impacto_social: '',
  por_que_importa: 'A indústria é termômetro da atividade econômica.',
  consequencias: { confirmadas: ['Quarta queda em cinco meses'], projecoes: ['Pode pesar no PIB do trimestre'] },
  relevancia_para_concursos: 'Indicadores do IBGE são cobrados em atualidades.',
  temas_de_prova: ['Economia brasileira', 'Indicadores'],
  memorizar: ['Recuo de 0,8% em setembro', 'Alta de 0,4% no ano'],
  abordagens_em_prova: ['Interpretação de indicador'],
  questoes: [{ enunciado: 'Segundo o IBGE, quanto recuou a produção industrial em setembro?', alternativas: { A: '0,8%', B: '1,5%', C: '2,3%', D: '0,1%', E: '3,0%' }, gabarito: 'A', comentario: 'O IBGE informou recuo de 0,8%.' }],
  referencias: ['https://agenciadenoticias.ibge.gov.br/n1', 'https://inventado.com/x'],
}

test('IA: remove raciocínio e extrai números normalizados', () => {
  assert.equal(stripReasoning('<think>pensando…</think>{"a":1}'), '{"a":1}')
  assert.equal(stripReasoning('raciocínio solto</think> resposta'), 'resposta')
  assert.deepEqual(numbersIn('R$ 13,5 bilhões, 27.279 vagas, -0,8%, 1,000.5 e 2026'), ['13.5', '27279', '0.8', '1000.5', '2026'])
})

test('validação: análise ancorada nas fontes passa; referência inventada é removida', () => {
  const v = validateAnalysis('```json\n' + JSON.stringify(good) + '\n```', input)
  assert.equal(v.ok, true)
  if (v.ok) {
    assert.deepEqual(v.data.referencias, ['https://agenciadenoticias.ibge.gov.br/n1'])
    assert.ok(v.warnings.some((w) => w.includes('referências fora das fontes')))
  }
})

test('validação: número inventado em campo factual é fatal; em contexto vira aviso; distrator pode ter número errado', () => {
  const bad = validateAnalysis(JSON.stringify({ ...good, resumo: 'A produção caiu 1,7% em setembro.' }), input)
  assert.equal(bad.ok, false)
  if (!bad.ok) assert.ok(bad.errors[0].includes('1.7'))
  const warn = validateAnalysis(JSON.stringify({ ...good, contexto: 'Em 2019 houve queda maior.' }), input)
  assert.equal(warn.ok, true)
  assert.ok(warn.warnings.some((w) => w.startsWith('contexto') && w.includes('2019')))
  const wrongAnswer = validateAnalysis(JSON.stringify({ ...good, questoes: [{ ...good.questoes[0], gabarito: 'B' }] }), input)
  assert.equal(wrongAnswer.ok, false) // a alternativa CORRETA precisa ter número das fontes
  const explica = validateAnalysis(JSON.stringify({ ...good, questoes: [{ ...good.questoes[0], comentario: 'O correto é 0,8%; 1,5% e 2,3% estão errados.' }] }), input)
  assert.equal(explica.ok, true) // comentário pode citar os distratores
})

test('validação: texto sem acentuação é recusado; acentuado passa', () => {
  const sem = validateAnalysis(JSON.stringify({ ...good, resumo: 'A producao nao caiu; o orgao publico informou a situacao economica.' }), input)
  assert.equal(sem.ok, false)
  if (!sem.ok) assert.ok(sem.errors.some((e) => e.startsWith('texto sem acentuação')))
  assert.deepEqual(unaccentedWords('Não houve decisão; a situação econômica é pública.'), [])
})

test('validação: formato inválido e JSON quebrado', () => {
  const { resumo: _, ...semResumo } = good
  const r = validateAnalysis(JSON.stringify(semResumo), input)
  assert.equal(r.ok, false)
  if (!r.ok) assert.ok(r.errors.some((e) => e.startsWith('resumo')))
  assert.equal(validateAnalysis('não sei', input).ok, false)
})

test('prompt: regras anti-invenção, fontes numeradas e hash estável', () => {
  const msgs = buildMessages(input)
  assert.match(msgs[0].content, /SOMENTE as informações das FONTES/)
  assert.match(msgs[1].content, /\[1\] IBGE \(fonte oficial\)/)
  assert.equal(inputHash(input), inputHash(structuredClone(input)))
  assert.notEqual(inputHash(input), inputHash({ ...input, category: 'outra' }))
})

function memoryUsage(start = 0) {
  const rows: UsageRow[] = []
  const store: UsageStore = { callsToday: async () => start + rows.filter((r) => r.status !== 'invalid_output').length, log: async (r) => void rows.push(r) }
  return { rows, store }
}
const provider = (answers: Record<string, (req: ChatRequest) => string | Error>): AIProvider & { calls: string[] } => {
  const calls: string[] = []
  return {
    name: 'fake',
    calls,
    async chat(model, req) {
      calls.push(model)
      const a = answers[model]?.(req) ?? new AIError('HTTP 404', 'unavailable', 404)
      if (a instanceof Error) throw a
      return { text: a, provider: 'fake', model, usage: { prompt: 10, completion: 20, total: 30 }, latencyMs: 5 }
    },
  }
}

test('cliente: troca de modelo quando o primeiro está indisponível e registra cada tentativa', async () => {
  const u = memoryUsage()
  const p = provider({ b: () => 'ok' })
  const r = await aiClient(p, u.store, { dailyBudget: 10 }).chat(['a', 'b'], { messages: [], maxTokens: 10 }, { task: 't', jobId: null })
  assert.equal(r.model, 'b')
  assert.deepEqual(u.rows.map((x) => [x.model, x.status]), [['a', 'error'], ['b', 'ok']])
})

test('cliente: cota diária impede novas chamadas', async () => {
  const u = memoryUsage(60)
  const p = provider({ a: () => 'ok' })
  await assert.rejects(aiClient(p, u.store, { dailyBudget: 60 }).chat(['a'], { messages: [], maxTokens: 10 }, { task: 't', jobId: null }), (e: AIError) => e.kind === 'budget')
  assert.deepEqual(p.calls, [])
})

test('cliente: limite de requisições e tempo esgotado viram status próprios', async () => {
  const u = memoryUsage()
  const p = provider({ a: () => new AIError('429', 'rate_limited', 429), b: () => new AIError('t', 'timeout') })
  await assert.rejects(aiClient(p, u.store, { dailyBudget: 10 }).chat(['a', 'b'], { messages: [], maxTokens: 10 }, { task: 't', jobId: null }))
  assert.deepEqual(u.rows.map((x) => x.status), ['rate_limited', 'timeout'])
})

test('NVIDIA: corpo da requisição, uso de tokens e erros classificados, sem vazar a chave', async () => {
  let body: Record<string, unknown> = {}
  const ok = nvidiaProvider({ apiKey: 'nvapi-SEGREDO', baseUrl: 'https://x.test/v1', fetchImpl: (async (_u: string, init: RequestInit) => {
    body = JSON.parse(String(init.body))
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"a":1}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 } }), { status: 200 })
  }) as unknown as typeof fetch })
  const r = await ok.chat('nvidia/nemotron-3.5-lightning-30b-a3b', { messages: [{ role: 'user', content: 'oi' }], maxTokens: 50 })
  assert.deepEqual([r.text, r.usage.total], ['{"a":1}', 12])
  assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false }) // raciocínio desligado neste modelo
  const fail = (status: number, payload: unknown) => nvidiaProvider({ apiKey: 'nvapi-SEGREDO', baseUrl: 'https://x.test/v1', fetchImpl: (async () => new Response(JSON.stringify(payload), { status })) as unknown as typeof fetch })
  await assert.rejects(fail(404, { detail: 'Not found for account' }).chat('m', { messages: [], maxTokens: 5 }), (e: AIError) => e.kind === 'unavailable' && !e.message.includes('SEGREDO'))
  await assert.rejects(fail(429, {}).chat('m', { messages: [], maxTokens: 5 }), (e: AIError) => e.kind === 'rate_limited')
  await assert.rejects(fail(200, { choices: [{ message: { content: null }, finish_reason: 'length' }] }).chat('m', { messages: [], maxTokens: 5 }), (e: AIError) => /limite de tokens/.test(e.message))
})

test('geração: corrige uma vez quando a primeira resposta viola as regras', async () => {
  const u = memoryUsage()
  let n = 0
  const p = provider({ a: () => (++n === 1 ? JSON.stringify({ ...good, resumo: 'Caiu 9,9%.' }) : JSON.stringify(good)) })
  const g = await generateAnalysis(aiClient(p, u.store, { dailyBudget: 10 }), ['a'], input, { jobId: null })
  assert.equal(g.status, 'valid')
  assert.equal(g.calls, 2)
  assert.deepEqual(u.rows.map((r) => r.status), ['ok', 'invalid_output', 'ok'])
  if (g.status === 'valid') {
    const row = toAnalysisRow(g.data, input)
    assert.equal(row.references[0].source, 'IBGE')
    assert.equal(row.historical_background, null)
  }
})

test('geração: persiste inválida após a correção falhar (vai para revisão)', async () => {
  const u = memoryUsage()
  const p = provider({ a: () => JSON.stringify({ ...good, resumo: 'Caiu 9,9%.' }) })
  const g = await generateAnalysis(aiClient(p, u.store, { dailyBudget: 10 }), ['a'], input, { jobId: null })
  assert.equal(g.status, 'invalid')
  assert.equal(await u.store.callsToday(), 2) // saídas inválidas não contam como chamada extra
})

const policy: SelectionPolicy = { pilotStates: ['CE'], perBlock: { estado: 2, nacional: 2, internacional: 1 }, minRelevance: 'media', editionStatuses: ['corroborada', 'parcialmente_corroborada', 'nao_confirmada'], singleSourceMinReliability: 4 }
const cand = (id: string, p: Partial<Candidate>): Candidate => ({ id, scope: 'nacional', state: null, relevance: 'alta', relevance_score: 60, verification_status: 'corroborada', needs_review: false, best_reliability: 5, ...p })

test('seleção: só elegíveis, limite por bloco e blocos intercalados (estado primeiro)', () => {
  const s = selectForAnalysis([
    cand('n1', { relevance_score: 90 }), cand('n2', { relevance_score: 80 }), cand('n3', { relevance_score: 70 }),
    cand('e1', { scope: 'estadual', state: 'CE', relevance_score: 40, relevance: 'media' }), cand('sp', { scope: 'estadual', state: 'SP' }),
    cand('i1', { scope: 'internacional' }), cand('i2', { scope: 'internacional', relevance_score: 50 }),
    cand('baixa', { relevance: 'baixa' }), cand('rev', { needs_review: true, relevance_score: 99 }),
    cand('div', { verification_status: 'fontes_divergentes', relevance_score: 99 }),
    cand('fraca', { verification_status: 'nao_confirmada', best_reliability: 3, relevance_score: 99 }),
    cand('forte', { verification_status: 'nao_confirmada', best_reliability: 4, relevance_score: 95 }),
  ], policy)
  assert.deepEqual(s.map((x) => x.id), ['e1', 'forte', 'i1', 'n1'])
  assert.deepEqual(s[0], { id: 'e1', block: 'estado', state: 'CE' })
})

test('dia de Brasília começa às 03:00 UTC', () => {
  assert.equal(startOfDayBrasilia(new Date('2026-11-06T02:30:00Z')), '2026-11-05T03:00:00.000Z')
  assert.equal(startOfDayBrasilia(new Date('2026-11-06T03:30:00Z')), '2026-11-06T03:00:00.000Z')
})
