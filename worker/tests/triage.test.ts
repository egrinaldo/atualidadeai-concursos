import assert from 'node:assert/strict'
import { test } from 'node:test'
import { categorize, relevanceOf, statesMentioned, triage, type TriageInput } from '../src/triage/classify.ts'
import { aggregateCluster, assignClusters, type ClusterDoc, type Member } from '../src/triage/cluster.ts'
import { detectLanguage, fold, stem, tokens } from '../src/triage/text.ts'

type Src = TriageInput['source']
const nacional: Src = { scope: 'nacional', state: null, default_category: null, reliability_level: 5, is_primary: true, language: 'pt' }
const estadualCE: Src = { ...nacional, scope: 'estadual', state: 'CE', default_category: 'acontecimentos_regionais' }
const internacional: Src = { ...nacional, scope: 'internacional', language: 'en' }
const input = (title: string, source: Src = nacional, excerpt: string | null = null): TriageInput => ({
  title, excerpt, language: source.language, scope: source.scope, state: source.state, category: source.default_category, source,
})
const kept = (r: ReturnType<typeof triage>) => {
  assert.equal(r.discard, false)
  return r as Extract<ReturnType<typeof triage>, { discard: false }>
}

test('texto: normalização, radicais e números', () => {
  assert.equal(fold('  Produção  INDÚSTRIA ção '), 'producao industria cao')
  assert.equal(stem('industrial'), stem('indústria'.normalize('NFD').replace(/[̀-ͯ]/g, '')))
  assert.equal(stem('recenseadores'), stem('recenseador'))
  assert.deepEqual(tokens('Produção recua -0,8% e 27.279 vagas'), ['produ', 'recua', '#0.8', '#27279', 'vaga'])
})

test('idioma: português, inglês e fallback', () => {
  assert.equal(detectLanguage('Governo define as regras para o setor de energia no país', 'en'), 'pt')
  assert.equal(detectLanguage('Commission proposes the fishing opportunities for the Atlantic in 2027', 'pt'), 'en')
  assert.equal(detectLanguage('Selic', 'pt'), 'pt')
})

test('triagem: ruído é descartado com motivo', () => {
  for (const t of ['Áudio: Senado aprova projeto', 'Vídeo: sessão especial', 'Daily Press Briefing by the Office of the Spokesman', 'Seção das Sessões', 'Security Council, 10266th Meeting (AM) Sudan', 'Prazos processuais ficam suspensos durante recesso do TCU', 'Curto']) {
    const r = triage(input(t))
    assert.equal(r.discard, true, t)
    if (r.discard) assert.match(r.reason, /^baixa relevância/)
  }
})

test('triagem: pauta de prova pontua alto; pauta institucional pontua baixo', () => {
  const lei = kept(triage(input('Câmara aprova projeto que cria política nacional de cuidados')))
  assert.ok(lei.score >= 60, String(lei.score))
  assert.ok(lei.reasons.some((x) => x.includes('lei/MP/PEC')))
  const selic = kept(triage(input('Copom mantém a taxa Selic em 13,75% a.a.')))
  assert.ok(['alta', 'muito_alta'].includes(selic.relevance))
  const eleicao = kept(triage(input('Eleições nos EUA têm vitórias históricas de minorias', { ...nacional, scope: 'internacional' })))
  assert.ok(eleicao.reasons.some((x) => x.includes('eleições')))
  const homenagem = kept(triage(input('MP do Ceará é homenageado na abertura do XI Congresso Brasileiro de Direito', estadualCE)))
  assert.equal(homenagem.relevance, 'baixa')
  const esporte = kept(triage(input('Atletas conquistam 36 medalhas no Open de Jiu-Jitsu', estadualCE)))
  assert.equal(esporte.relevance, 'baixa')
})

test('triagem: "sus" não casa dentro de "suspensos"', () => {
  const r = kept(triage(input('Pagamentos suspensos de fornecedores do município geram reclamações')))
  assert.ok(!r.reasons.some((x) => x.includes('saúde pública')))
})

test('alcance: fonte nacional com fato de um estado vai para o bloco do estado', () => {
  const r = kept(triage(input('Cagece terá de regularizar abastecimento em Fortaleza, decide Justiça')))
  assert.equal(r.scope, 'estadual')
  assert.equal(r.state, 'CE')
})

test('alcance: lei federal que cita um estado continua nacional', () => {
  const r = kept(triage(input('Câmara aprova projeto que reconhece artesanato do Maranhão como cultura nacional')))
  assert.equal(r.scope, 'nacional')
  assert.equal(r.state, null)
})

test('alcance: fato no exterior vira internacional; pauta brasileira sobre o exterior não', () => {
  assert.equal(kept(triage(input('Presidente do Paraguai renuncia em meio à crise bancária'))).scope, 'internacional')
  assert.equal(kept(triage(input('Comissão mista aprova plano para exportadores atingidos pelo tarifaço norte-americano'))).scope, 'nacional')
})

test('alcance: fontes estaduais e internacionais mantêm o alcance da fonte', () => {
  const r = kept(triage(input('MP firma acordo com Buenos Aires contra violência nos estádios', estadualCE)))
  assert.deepEqual([r.scope, r.state], ['estadual', 'CE'])
  assert.equal(kept(triage(input('Security Council adopts resolution on Sudan ceasefire', internacional))).scope, 'internacional')
})

test('estados: "Pará" só com acento; sigla entre parênteses', () => {
  assert.deepEqual([...statesMentioned('Recursos para a saúde')], [])
  assert.deepEqual([...statesMentioned('Chuvas atingem o Pará')], ['PA'])
  assert.deepEqual([...statesMentioned('Governo do Pará anuncia obras')], ['PA'])
  assert.deepEqual([...statesMentioned('Conferência em Natal (RN)')], ['RN'])
  assert.deepEqual([...statesMentioned('Auditoria na PB e no Rio Grande do Norte')].sort(), ['RN'])
})

test('categoria: palavras-chave, padrão da fonte e política internacional', () => {
  assert.equal(categorize('Produção industrial recua 0,8%', null, null, 'nacional'), 'economia')
  assert.equal(categorize('Ministério da Saúde compra vacinas contra mpox', null, null, 'nacional'), 'saude')
  assert.equal(categorize('Evento comemorativo', null, null, 'estadual'), 'acontecimentos_regionais')
  assert.equal(categorize('Partidos e senador debatem no Congresso', null, null, 'internacional'), 'politica_internacional')
})

test('relevância: faixas', () => {
  assert.deepEqual([0, 34, 35, 49, 50, 69, 70, 100].map(relevanceOf), ['baixa', 'baixa', 'media', 'media', 'alta', 'alta', 'muito_alta', 'muito_alta'])
})

const t0 = Date.parse('2026-11-05T12:00:00Z')
const doc = (id: string, title: string, h = 0, language = 'pt'): ClusterDoc => ({ id, title, excerpt: null, language, at: t0 + h * 3_600_000, cluster_id: null })
const corpus = [
  'Produção industrial recua 0,8% em setembro', 'Produção da indústria recua 0,8% em setembro; 4ª queda', 'Indústria nacional recua 0,8% e acumula alta',
  'Copom mantém a taxa Selic', 'Presidente do Paraguai renuncia', 'Câmara aprova projeto de saúde', 'Comissão aprova programa de amamentação',
  'Senado aprova crédito a exportadores', 'Prefeitura entrega posto de saúde', 'IBGE abre seleção para recenseadores', 'Dólar sobe com instabilidade',
].map((title) => ({ title, excerpt: null }))
let seq = 0
const opts = { threshold: 0.38, windowHours: 72, newId: () => `c${++seq}` }

test('agrupamento: mesmo fato em fontes diferentes forma um assunto; fatos diferentes, não', () => {
  const a = assignClusters([
    doc('a', 'Produção industrial recua -0,8% em setembro'),
    doc('b', 'Produção da indústria recua 0,8% em setembro; 4ª queda em cinco meses', 1),
    doc('c', 'Indústria nacional recua -0,8% em setembro e acumula 0,4% em 2026', 2),
    doc('d', 'Copom mantém a taxa Selic em 13,75%', 3),
    doc('e', 'Presidente do Paraguai renuncia em meio à crise bancária', 4),
  ], [], corpus, opts)
  assert.equal(a.get('b')!.cluster_id, a.get('a')!.cluster_id)
  assert.equal(a.get('c')!.cluster_id, a.get('a')!.cluster_id)
  assert.notEqual(a.get('d')!.cluster_id, a.get('a')!.cluster_id)
  assert.notEqual(a.get('e')!.cluster_id, a.get('d')!.cluster_id)
  assert.equal(new Set([...a.values()].map((x) => x.cluster_id)).size, 3)
})

test('agrupamento: entra em assunto já existente; respeita janela de tempo e idioma', () => {
  const existing = [{ ...doc('x', 'Produção industrial recua -0,8% em setembro'), cluster_id: 'velho' }]
  const a = assignClusters([
    doc('n1', 'Produção da indústria recua 0,8% em setembro', 5),
    doc('n2', 'Produção da indústria recua 0,8% em setembro', 100), // fora da janela de 72h
    doc('n3', 'Industrial production falls 0.8% in September', 6, 'en'),
  ], existing, corpus, opts)
  assert.deepEqual(a.get('n1'), { cluster_id: 'velho', similarity: a.get('n1')!.similarity, is_new: false })
  assert.notEqual(a.get('n2')!.cluster_id, 'velho')
  assert.notEqual(a.get('n3')!.cluster_id, 'velho')
})

const member = (p: Partial<Member>): Member => ({
  id: 'm', title: 't', scope: 'nacional', state: null, category: 'economia', relevance_score: 50, at: t0, source_key: 's1', reliability_level: 5, is_primary: true, ...p,
})

test('assunto: título da matéria mais relevante, bônus por fontes independentes', () => {
  const agg = aggregateCluster([
    member({ id: '1', title: 'Comissão acompanha crise no Paraguai', relevance_score: 55, source_key: 'senado' }),
    member({ id: '2', title: 'Presidente do Paraguai renuncia', relevance_score: 56, source_key: 'ebc', scope: 'internacional', is_primary: false }),
  ])
  assert.equal(agg.title, 'Presidente do Paraguai renuncia')
  assert.equal(agg.scope, 'internacional') // empate de alcance: vence o da matéria mais relevante
  assert.equal(agg.source_count, 2)
  assert.equal(agg.relevance_score, 61)
  assert.equal(agg.relevance, 'alta')
  const same = aggregateCluster([member({ id: '1' }), member({ id: '2' }), member({ id: '3' })])
  assert.equal(same.source_count, 1)
  assert.equal(same.relevance_score, 50) // mesma fonte não dá bônus
})

test('assunto: um estado → estadual; estados diferentes → nacional', () => {
  const ce = aggregateCluster([member({ scope: 'estadual', state: 'CE' }), member({ id: '2', scope: 'estadual', state: 'CE' })])
  assert.deepEqual([ce.scope, ce.state], ['estadual', 'CE'])
  const varios = aggregateCluster([member({ scope: 'estadual', state: 'SP' }), member({ id: '2', scope: 'estadual', state: 'MT' })])
  assert.deepEqual([varios.scope, varios.state], ['nacional', null])
})

test('alcance: veículo estadual (O Povo) publica mundo e Brasil — decide pela seção/conteúdo; órgão oficial fica no estado', () => {
  const opovo: Src = { ...estadualCE, is_primary: false, reliability_level: 4 }
  const mundo = kept(triage({ ...input('O que a China espera de cúpula com Trump e Putin sobre a Ucrânia?', opovo), url: 'https://www.opovo.com.br/noticias/mundo/2026/11/06/china.html' }))
  assert.equal(mundo.scope, 'internacional')
  const semSecao = kept(triage({ ...input('Latino-americanos mudam voto e rejeitam Trump nas eleições dos EUA', opovo), url: 'https://www.opovo.com.br/noticias/2026/11/06/x.html' }))
  assert.equal(semSecao.scope, 'internacional')
  const brasil = kept(triage({ ...input('Governo anuncia reajuste do salário mínimo para 2027', opovo), url: 'https://www.opovo.com.br/noticias/brasil/2026/11/06/x.html' }))
  assert.equal(brasil.scope, 'nacional')
  const local = kept(triage({ ...input('Prefeitura de Fortaleza amplia horário de postos de saúde', opovo), url: 'https://www.opovo.com.br/noticias/fortaleza/2026/11/06/x.html' }))
  assert.deepEqual([local.scope, local.state], ['estadual', 'CE'])
  const mp = kept(triage({ ...input('MP firma acordo com Buenos Aires contra violência nos estádios', estadualCE), url: 'https://mpce.mp.br/mundo/x/' }))
  assert.equal(mp.scope, 'estadual') // órgão oficial: mesmo citando o exterior
  const g1mundo = kept(triage({ ...input('Presidente do Paraguai renuncia', nacional), url: 'https://g1.globo.com/mundo/noticia/2026/11/05/x.ghtml' }))
  assert.equal(g1mundo.scope, 'internacional')
})
