/**
 * Trechos REAIS das edições publicadas (Ceará, 06 e 07/11/2026) usados nas ilustrações da página inicial.
 * Textos do próprio informativo (verificados e aprovados na auditoria de veracidade), resumidos para caber
 * no cartão. Ao trocar, use sempre um trecho de edição publicada — nada inventado.
 */
export type SampleItem = { level: 'Estadual' | 'Nacional' | 'Internacional'; title: string; text: string }

export const dailySample = {
  title: 'Informativo diário',
  edition: 'Ceará · edição de 06/11/2026',
  lead: {
    level: 'Nacional',
    title: 'Copom mantém Selic em 13,75% ao ano',
    text: 'O Comitê de Política Monetária manteve a taxa citando o ambiente externo mais adverso e a inflação acima do limite superior da meta.',
  } satisfies SampleItem,
  whyItMatters:
    'Política monetária, inflação e crescimento econômico são frequentes em provas de economia e atualidades: a Selic afeta crédito, investimentos e o poder de compra.',
  more: [
    { level: 'Estadual', title: 'MPCE firma acordo com Buenos Aires para combater violência em estádios', text: '' },
    { level: 'Internacional', title: 'Conselho de Segurança da ONU debate recomendações do Comitê de Sanções do Iêmen', text: '' },
  ] satisfies SampleItem[],
}

/** Uma história acompanhada em dias seguidos, como aparece na revisão semanal (linha do tempo). */
export const weeklySample = {
  title: 'Revisão semanal',
  edition: 'Montada com fatos reais das edições de 06 e 07/11',
  story: {
    level: 'Internacional',
    title: 'Crise no Paraguai: da renúncia de Santiago Peña à ordem de prisão',
    text: 'O colapso do banco digital Ueno Bank levou a um processo de impeachment; Peña renunciou e, após o julgamento, a Justiça determinou sua prisão preventiva.',
  } satisfies SampleItem,
  timeline: [
    { date: '05/11', fact: 'Peña anuncia a renúncia; a Câmara aprova o impeachment por unanimidade' },
    { date: '06/11', fact: 'Congresso conclui o impeachment e a Justiça determina a prisão preventiva' },
  ],
  memorize: ['Gatilho: crise bancária (Ueno Bank)', 'Vice Pedro Allana assume a Presidência'],
  sources: 'Agência Brasil, Agência Senado, G1, UOL, CNN Brasil',
}

export const dailyHeadlines = [
  'Produção industrial recua 0,8% em setembro',
  'Câmara aprova educação em saúde com foco na família no SUS',
  'ONU alerta que o mundo está fora do caminho para as metas de 2030',
]

export const monthlyContents = ['Os assuntos de maior peso do mês', 'Linha do tempo de cada tema', 'Questões de revisão comentadas']
