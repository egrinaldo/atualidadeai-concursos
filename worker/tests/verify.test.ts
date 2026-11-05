import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isStale } from '../src/jobs/verify.ts'
import { attributions, compareClaims, extractClaims, parseNumber } from '../src/verify/claims.ts'
import { verifyCluster, type VerifyMember } from '../src/verify/verify.ts'

const m = (p: Partial<VerifyMember> & { id: string }): VerifyMember => ({
  title: 'Título', excerpt: 'Texto suficiente para verificação, com mais de sessenta caracteres de conteúdo real.', content: null,
  url: `https://exemplo.gov.br/${p.id}`, language: 'pt', source_name: 'Fonte', group_key: p.id, is_primary: false, reliability_level: 4, ...p,
})

test('números: formatos brasileiro e inglês', () => {
  assert.equal(parseNumber('27.279'), 27279)
  assert.equal(parseNumber('13,75'), 13.75)
  assert.equal(parseNumber('1,000', true), 1000)
  assert.equal(parseNumber('1.8', true), 1.8)
})

test('afirmações: percentuais, dinheiro e quantidades, sem duplicar', () => {
  const c = extractClaims('n1', 'Produção industrial recua -0,8% em setembro; crédito de R$ 13,5 bilhões; edital com 27.279 vagas. Recua 0,8%.')
  const by = (k: string) => c.filter((x) => x.kind === k)
  assert.deepEqual(by('percentual').map((x) => x.value), [0.8])
  assert.deepEqual(by('valor_monetario').map((x) => [x.unit, x.value]), [['BRL', 13.5e9]])
  assert.deepEqual(by('quantidade').map((x) => [x.unit, x.value]), [['vagas', 27279]])
  const en = extractClaims('n2', 'The Commission disburses €4.36 billion to Ukraine', 'en')
  assert.deepEqual(en.map((x) => [x.unit, x.value]), [['EUR', 4.36e9]])
})

test('comparação: mesma coisa coincide; valor diferente diverge; mesma fonte não conta', () => {
  const a = extractClaims('a', 'A produção industrial recua 0,8% em setembro')
  const b = extractClaims('b', 'Produção industrial recuou 0,8% em setembro, diz IBGE')
  const c = extractClaims('c', 'Produção industrial recua 1,2% em setembro')
  const groups: Record<string, string> = { a: 'ebc', b: 'ibge', c: 'outro' }
  const r = compareClaims([...a, ...b, ...c], (id) => groups[id])
  assert.ok(r.some((x) => x.relation === 'coincide' && x.a.news_id === 'a' && x.b.news_id === 'b'))
  assert.ok(r.some((x) => x.relation === 'diverge'))
  assert.deepEqual(compareClaims([...a, ...c], () => 'mesmo-grupo'), [])
  // arredondamento: "mais de 27 mil vagas" × "27.279 vagas" coincide
  const r2 = compareClaims([...extractClaims('x', 'IBGE abre seleção com 27 mil vagas de recenseador'), ...extractClaims('y', 'IBGE lança seleção com 27.279 vagas de recenseador')], (id) => id)
  assert.equal(r2[0]?.relation, 'coincide')
})

test('atribuição explícita é registrada', () => {
  assert.deepEqual(attributions('A taxa caiu, segundo o IBGE. De acordo com o Ministério da Saúde, as doses chegam amanhã.'), ['IBGE', 'Ministério da Saúde'])
  assert.deepEqual(attributions('o órgão divulgou des dados novos'), [])
})

test('status: duas fontes independentes com oficial → corroborada (alta)', () => {
  const v = verifyCluster([m({ id: 'a', is_primary: true, reliability_level: 5, source_name: 'IBGE' }), m({ id: 'b', source_name: 'Agência Brasil' })], 'alta')
  assert.deepEqual([v.verification_status, v.confidence_level, v.independent_sources, v.needs_human_review], ['corroborada', 'alta', 2, false])
  assert.equal(v.evidence[0].source, 'IBGE') // fonte oficial primeiro
  assert.ok(v.evidence.every((e) => e.url.startsWith('https://'))) // evidências só do banco
})

test('status: matérias do mesmo grupo não são fontes independentes', () => {
  const v = verifyCluster([m({ id: 'a', group_key: 'ebc' }), m({ id: 'b', group_key: 'ebc' })], 'media')
  assert.equal(v.independent_sources, 1)
  assert.equal(v.verification_status, 'nao_confirmada')
})

test('status: só a fonte oficial → parcialmente corroborada', () => {
  const v = verifyCluster([m({ id: 'a', is_primary: true })], 'alta')
  assert.equal(v.verification_status, 'parcialmente_corroborada')
  assert.equal(v.needs_human_review, false)
})

test('status: fonte única não oficial; revisão só se relevância alta E confiabilidade abaixo do mínimo', () => {
  assert.equal(verifyCluster([m({ id: 'a', reliability_level: 3 })], 'media').needs_human_review, false)
  const fraca = verifyCluster([m({ id: 'a', reliability_level: 3 })], 'alta')
  assert.deepEqual([fraca.verification_status, fraca.confidence_level, fraca.needs_human_review], ['nao_confirmada', 'baixa', true])
  const confiavel = verifyCluster([m({ id: 'a', reliability_level: 4 })], 'alta')
  assert.deepEqual([confiavel.verification_status, confiavel.needs_human_review], ['nao_confirmada', false])
  assert.equal(verifyCluster([m({ id: 'a', reliability_level: 4 })], 'alta', { singleSourceMinReliability: 5 }).needs_human_review, true)
})

test('divergência: números do corpo do texto não geram divergência', () => {
  const v = verifyCluster([
    m({ id: 'a', title: 'Produção industrial recua 0,8% em setembro', is_primary: true, content: 'No ano, a produção industrial acumula alta de 0,4%.' }),
    m({ id: 'b', title: 'Produção industrial recua 0,8% em setembro', content: 'Em doze meses, a produção industrial acumula alta de 1,1%.' }),
  ], 'alta')
  assert.equal(v.verification_status, 'corroborada')
  assert.ok(v.analysis.includes('Números coincidem'))
})

test('status: sem texto (só título) e sem fonte oficial → insuficiente', () => {
  assert.equal(verifyCluster([m({ id: 'a', excerpt: null })], 'baixa').verification_status, 'insuficiente')
})

test('status: números divergentes entre fontes → fontes divergentes + revisão', () => {
  const v = verifyCluster([
    m({ id: 'a', title: 'Desemprego cai para 5,2% no trimestre', is_primary: true }),
    m({ id: 'b', title: 'Desemprego cai para 6,1% no trimestre' }),
  ], 'alta')
  assert.deepEqual([v.verification_status, v.needs_human_review], ['fontes_divergentes', true])
  assert.deepEqual(v.contradictory_news_ids.sort(), ['a', 'b'])
})

test('status: desmentido explícito → contradita; "STF nega pedido" não é desmentido', () => {
  const v = verifyCluster([m({ id: 'a', title: 'Vídeo mostra anúncio de feriado nacional' }), m({ id: 'b', title: 'Governo desmente anúncio de feriado nacional', is_primary: true })], 'media')
  assert.deepEqual([v.verification_status, v.contradictory_news_ids], ['contradita', ['b']])
  const ok = verifyCluster([m({ id: 'a', title: 'STF nega pedido de habeas corpus', is_primary: true }), m({ id: 'b', title: 'Supremo nega habeas corpus' })], 'alta')
  assert.equal(ok.verification_status, 'corroborada')
})

test('fila: verifica assunto novo ou alterado depois da última verificação', () => {
  assert.equal(isStale({ verified_at: null, members_changed_at: '2026-11-05T10:00:00Z' }), true)
  assert.equal(isStale({ verified_at: '2026-11-05T11:00:00Z', members_changed_at: '2026-11-05T10:00:00Z' }), false)
  assert.equal(isStale({ verified_at: '2026-11-05T09:00:00Z', members_changed_at: '2026-11-05T10:00:00Z' }), true)
})
