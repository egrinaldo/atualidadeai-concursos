import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AnalysisSource } from '../src/analysis/prompt.ts'
import { auditHash, buildAuditMessages, isNegativeQuestion, judge, quoteInSource, weekdayDateIssues, type AuditTarget } from '../src/audit/audit.ts'
import { auditTarget } from '../src/jobs/audit.ts'

const src: AnalysisSource[] = [
  {
    n: 1, source: 'Agência Brasil', official: true, title: 'Peña renuncia à Presidência do Paraguai', url: 'https://agenciabrasil.ebc.com.br/x', published_at: '2026-11-05T12:00:00Z',
    text: 'Enquanto a Câmara discutia o impeachment, nesta quinta-feira (5), o presidente Santiago Peña anunciou a renúncia ao cargo. O vice-presidente Pedro Allana assumirá o cargo. Notícias relacionadas: Presidente do BC renuncia. Mesmo com a renúncia, a Câmara dos Deputados aprovou, por unanimidade, o processo de impeachment.',
  },
  { n: 2, source: 'Procon', official: true, title: 'Decon multa banco', url: 'https://mpce.mp.br/y', published_at: '2026-11-05T12:00:00Z', text: 'Entre as infrações estão refinanciamentos sem autorização e práticas consideradas abusivas.' },
]
const target: AuditTarget = {
  title: 'Peña renuncia no Paraguai', summary: 'Santiago Peña renunciou.', whatHappened: 'Na quinta-feira (5/11), Peña renunciou.', memorize: ['Pedro Allana assume'], confirmed: [],
  questions: [{ statement: 'Assinale a alternativa INCORRETA.', correct: 'O Banco Central do Brasil interveio no banco.', comment: 'Foi o BC paraguaio.' }],
}
const out = (claims: unknown[]) => JSON.stringify({ afirmacoes: claims })

test('auditoria: trecho literal confere (sem acento/pontuação) e recusa trecho inventado ou vazio de conteúdo', () => {
  assert.ok(quoteInSource('o presidente Santiago Pena anunciou a renuncia ao cargo', src[0].text))
  assert.ok(!quoteInSource('o presidente Santiago Peña anunciou a renúncia ao mandato', src[0].text))
  assert.ok(!quoteInSource('o presidente', src[0].text)) // curto e sem conteúdo
  assert.ok(quoteInSource('precursor chemicals', 'reports addressing dual-use items, precursor chemicals, information-sharing')) // termo técnico curto
  assert.ok(!quoteInSource('cursor chemical', 'reports addressing precursor chemicals')) // só palavra inteira
  assert.ok(quoteInSource('refinanciamentos sem autorização', src[1].text)) // curto, mas com conteúdo
  assert.ok(quoteInSource('ocorrerá das 13h às 17h', 'O evento é aberto e ocorrerá das 13h às 17h, no Plenário.')) // números contam como conteúdo
})

test('auditoria: frases separadas na fonte (ou com reticências) valem se cada uma existir', () => {
  const joined = 'O vice-presidente Pedro Allana assumirá o cargo. Mesmo com a renúncia, a Câmara dos Deputados aprovou, por unanimidade, o processo de impeachment'
  assert.ok(quoteInSource(joined, src[0].text))
  assert.ok(quoteInSource('Peña anunciou a renúncia ao cargo … aprovou, por unanimidade, o processo', src[0].text))
  assert.ok(quoteInSource('Peña anunciou a renúncia ao cargo [...] aprovou, por unanimidade, o processo', src[0].text)) // reticências entre colchetes
  assert.ok(quoteInSource('o Projeto de Lei 565/20, que obriga os profissionais', 'aprovou o Projeto de Lei 565/20 , que obriga os profissionais de saúde')) // espaço antes da vírgula
  assert.ok(!quoteInSource('O vice-presidente Pedro Allana assumirá o cargo. A Câmara rejeitou o impeachment por unanimidade', src[0].text))
})

test('auditoria: dia da semana confere com a data', () => {
  assert.deepEqual(weekdayDateIssues('Na quinta-feira (5/11) e na sexta, 6/11', 2026), [])
  assert.equal(weekdayDateIssues('na segunda-feira (5/11)', 2026).length, 1)
  assert.match(weekdayDateIssues('quarta-feira, 31/11', 2026)[0], /inexistente/)
})

test('auditoria: questão "assinale a INCORRETA" é reconhecida', () => {
  assert.ok(isNegativeQuestion('Assinale a alternativa INCORRETA sobre o caso'))
  assert.ok(isNegativeQuestion('Todas estão corretas, exceto:'))
  assert.ok(!isNegativeQuestion('Assinale a alternativa correta'))
  assert.match(buildAuditMessages(target, src)[1].content, /pede a alternativa INCORRETA/)
})

test('auditoria: aprova quando tudo está sustentado com trecho verificado', () => {
  const r = judge(out([
    { campo: 'resumo', afirmacao: 'Peña renunciou', veredito: 'apoiada', fonte: 1, trecho: 'Santiago Peña anunciou a renúncia ao cargo' },
    { campo: 'questao_incorreta', afirmacao: 'BC do Brasil interveio', veredito: 'contradita', fonte: 1, trecho: 'Presidente do BC renuncia' },
  ]), src, target, 2026)
  assert.equal(r.status, 'aprovada')
  assert.equal(r.summary.apoiada, 1)
})

test('auditoria: "apoiada" sem trecho verificável vira sem suporte e reprova; contradita reprova', () => {
  const r = judge(out([{ campo: 'resumo', afirmacao: 'Peña renunciou em 2025', veredito: 'apoiada', fonte: 1, trecho: 'Peña renunciou em 2025 após votação' }]), src, target, 2026)
  assert.equal(r.status, 'reprovada')
  assert.equal(r.claims[0].verdict, 'sem_suporte')
  assert.equal(r.summary.quotes_not_found, 1)
  const c = judge(out([{ campo: 'memorizar', afirmacao: 'Allana é senador', veredito: 'contradita', fonte: 1, trecho: 'O vice-presidente Pedro Allana assumirá o cargo' }]), src, target, 2026)
  assert.equal(c.status, 'reprovada')
  assert.match(c.problems[0], /contradita/)
})

test('auditoria: data tirada do cabeçalho da fonte (data de publicação) vale como trecho', () => {
  const r = judge(out([{ campo: 'resumo', afirmacao: 'A renúncia foi em 5/11/2026', veredito: 'apoiada', fonte: 1, trecho: 'Agência Brasil (2026-11-05)' }]), src, target, 2026)
  assert.equal(r.claims[0].verdict, 'apoiada')
})

test('auditoria: parcial no que o aluno memoriza reprova; parcial no texto corrido sozinho não', () => {
  const claim = (campo: string) => out([{ campo, afirmacao: 'Estados flagram navios', veredito: 'parcial', fonte: 1, trecho: 'Santiago Peña anunciou a renúncia ao cargo', observacao: 'tradução imprecisa' }])
  assert.equal(judge(claim('memorizar'), src, target, 2026).status, 'reprovada')
  assert.equal(judge(claim('o_que_aconteceu'), src, target, 2026).status, 'aprovada')
})

test('auditoria: questão "incorreta" com alternativa verdadeira é erro da questão', () => {
  const r = judge(out([{ campo: 'questao_incorreta', afirmacao: 'Peña renunciou', veredito: 'apoiada', fonte: 1, trecho: 'Santiago Peña anunciou a renúncia ao cargo' }]), src, target, 2026)
  assert.equal(r.status, 'reprovada')
  assert.match(r.problems[0], /alternativa incorreta/)
})

test('auditoria: trecho em outra fonte que não a indicada ainda vale; textos longos são cortados, não recusados', () => {
  const r = judge(out([{ campo: 'o_que_aconteceu', afirmacao: 'x'.repeat(900), veredito: 'apoiada', fonte: 1, trecho: 'refinanciamentos sem autorização', observacao: 'y'.repeat(2000) }]), src, target, 2026)
  assert.equal(r.claims[0].verdict, 'apoiada')
  assert.equal(r.claims[0].claim.length, 600)
  assert.throws(() => judge('não sei', src, target, 2026), /auditor inválida/)
})

test('auditoria: data com dia da semana errado no texto reprova mesmo com afirmações sustentadas', () => {
  const t = { ...target, whatHappened: 'Na segunda-feira (5/11), Peña renunciou.' }
  const r = judge(out([{ campo: 'resumo', afirmacao: 'Peña renunciou', veredito: 'apoiada', fonte: 1, trecho: 'Santiago Peña anunciou a renúncia ao cargo' }]), src, t, 2026)
  assert.equal(r.status, 'reprovada')
  assert.match(r.problems.join(' '), /dia da semana/)
})

test('auditoria: hash muda com o texto e com as fontes; alvo inclui linha do tempo das sínteses', () => {
  assert.notEqual(auditHash(target, src), auditHash({ ...target, summary: 'outro' }, src))
  assert.notEqual(auditHash(target, src), auditHash(target, src.slice(0, 1)))
  const t = auditTarget({ editorial_title: 'T', summary: 'S', what_happened: 'W', memorize: ['m'], consequences: { confirmados: ['c'] }, questions: [{ enunciado: 'E', alternativas: { A: 'a', B: 'b' }, gabarito: 'B', comentario: 'k' }], period_meta: { timeline: [{ data: '03/11', fato: 'abertura' }] } })
  assert.deepEqual(t.timeline, ['03/11: abertura'])
  assert.equal(t.questions[0].correct, 'b')
  assert.match(buildAuditMessages(t, src)[1].content, /LINHA DO TEMPO 1: 03\/11: abertura/)
})
