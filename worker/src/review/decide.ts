/**
 * Revisão automática da fila: para cada assunto marcado "precisa de revisão", o robô decide sozinho com regras
 * fixas e conservadoras — na dúvida, o assunto FICA FORA da edição (nunca entra sem verificação + auditoria).
 * Toda decisão vai para editorial_reviews (revisor = robô) e o editor pode desfazer pelo painel.
 */

export type ReviewInput = {
  verificationStatus: string | null
  /** Análise atual do assunto (a mais recente que não foi substituída), se houver */
  analysis: { status: 'valid' | 'edited' | 'invalid'; auditStatus: string; auditAttempts: number; errors: string[] } | null
  /** Quantas vezes o robô já pediu nova análise deste assunto */
  robotReanalyses: number
}

export type ReviewAction =
  | 'release' // tira da fila; o assunto segue as regras normais (entra se cumprir verificação + auditoria)
  | 'approve' // texto auditado e aprovado: liberado para a edição
  | 'reanalyze' // descarta a análise atual; o robô escreve outra (que será validada e auditada)
  | 'discard' // fora das edições
  | 'wait' // auditoria ainda vai rodar
  | 'human' // texto editado por pessoa e reprovado: fica com o editor

export type ReviewDecision = { action: ReviewAction; reason: string }

const VERIFICATION_REASON: Record<string, string> = {
  nao_confirmada: 'fonte única ainda não confirmada por outra fonte — fica fora da edição; entra sozinho se outra fonte confirmar',
  insuficiente: 'informação insuficiente para verificar — fica fora da edição até haver mais fontes',
  contradita: 'fontes se contradizem — fica fora da edição; volta a ser avaliado se novas matérias resolverem a divergência',
  fontes_divergentes: 'fontes divergem em números/datas — fica fora da edição; volta a ser avaliado se novas matérias resolverem a divergência',
}

export function decideReview(i: ReviewInput, maxReanalysis: number): ReviewDecision {
  const a = i.analysis
  // Sem análise: o motivo é a verificação. Liberar a fila não coloca o assunto na edição — a política de
  // verificação (fontes confirmadas, confiabilidade mínima) continua valendo na seleção.
  if (!a) {
    const r = VERIFICATION_REASON[i.verificationStatus ?? ''] ?? 'verificação concluída — segue as regras normais de seleção'
    return { action: 'release', reason: r }
  }
  const canRetry = i.robotReanalyses < maxReanalysis
  if (a.status === 'invalid')
    return canRetry
      ? { action: 'reanalyze', reason: `análise reprovada na validação (${a.errors[0]?.slice(0, 120) ?? 'formato'}) — nova análise` }
      : { action: 'discard', reason: `análise reprovada na validação de novo após ${i.robotReanalyses} nova(s) tentativa(s) — fora das edições` }
  if (a.auditStatus === 'aprovada' || a.auditStatus === 'dispensada')
    return { action: 'approve', reason: 'texto conferido pela auditoria de veracidade — avisos da validação resolvidos' }
  if (a.auditStatus === 'pendente' || (a.auditStatus === 'erro' && a.auditAttempts < 2))
    return { action: 'wait', reason: 'aguardando a auditoria de veracidade' }
  // Reprovada (ou auditoria impossível): texto de pessoa fica com o editor; texto da IA ganha nova chance ou sai
  if (a.status === 'edited') return { action: 'human', reason: 'texto editado por pessoa reprovado na auditoria — decisão do editor' }
  const why = a.auditStatus === 'erro' ? 'auditoria não conseguiu conferir o texto' : 'reprovada na auditoria de veracidade mesmo após correção'
  return canRetry
    ? { action: 'reanalyze', reason: `${why} — nova análise do zero` }
    : { action: 'discard', reason: `${why}, também na nova análise — fora das edições` }
}
