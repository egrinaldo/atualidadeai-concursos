/**
 * =====================================================================
 * TEXTOS DA LANDING PAGE
 * ---------------------------------------------------------------------
 * Para alterar qualquer texto do site, edite este arquivo.
 * Os componentes em src/components/sections apenas exibem estes dados.
 *
 * Regra do projeto: nada de depoimentos, números de clientes ou
 * resultados fictícios. Conteúdo ilustrativo deve ser marcado como
 * EXEMPLO na interface.
 * =====================================================================
 */
import type { IconName } from '@/components/ui/Icon'
import { formatBRL, plan } from './plans'

export const navLinks = [
  { label: 'Como funciona', href: '#como-funciona' },
  { label: 'Cobertura', href: '#cobertura' },
  { label: 'Materiais', href: '#materiais' },
  { label: 'Assinatura', href: '#planos' },
  { label: 'Dúvidas', href: '#duvidas' },
] as const

export const hero = {
  eyebrow: 'Atualidades para concursos públicos',
  titleStart: 'As atualidades que podem cair na sua prova,',
  titleHighlight: 'organizadas todos os dias.',
  description:
    'Inteligência artificial monitora as notícias e transforma os fatos mais relevantes do seu estado, do Brasil e do mundo em material de estudo direto ao ponto, em PDF.',
  primaryCta: { label: 'Quero assinar', href: '#planos' },
  secondaryCta: { label: 'Como funciona', href: '#como-funciona' },
}

/** Fatos do produto (não são métricas de uso). */
export const highlights: { icon: IconName; value: string; label: string }[] = [
  { icon: 'layers', value: '3 níveis', label: 'Regional, nacional e internacional' },
  { icon: 'fileText', value: '3 formatos', label: 'PDF diário, semanal e mensal' },
  { icon: 'mapPin', value: '27 UFs', label: 'Atualidades do seu estado e cidade' },
]

export const problems = {
  eyebrow: 'O problema',
  title: 'Estudar atualidades não deveria',
  titleHighlight: 'consumir seu dia.',
  description:
    'Atualidades costumam ser a parte mais imprevisível do edital. Sem um método, o tempo vai embora entre portais, redes sociais e resumos desencontrados.',
  items: [
    {
      icon: 'newspaper',
      title: 'Excesso de notícias',
      text: 'Dezenas de portais publicando o tempo todo. Difícil separar o que é relevante do que é ruído.',
    },
    {
      icon: 'clock',
      title: 'Pouco tempo',
      text: 'Cada hora lendo notícias é uma hora a menos de português, direito ou raciocínio lógico.',
    },
    {
      icon: 'mapPin',
      title: 'Regionais esquecidas',
      text: 'Concursos estaduais e municipais cobram fatos locais que quase nenhum material organiza.',
    },
    {
      icon: 'inbox',
      title: 'Revisão desorganizada',
      text: 'Anotações espalhadas tornam a revisão da véspera da prova lenta e incompleta.',
    },
  ] satisfies { icon: IconName; title: string; text: string }[],
}

export const benefits = {
  eyebrow: 'Benefícios',
  title: 'Seu estudo de atualidades,',
  titleHighlight: 'no piloto automático.',
  items: [
    {
      icon: 'filter',
      title: 'Curadoria com foco em prova',
      text: 'Prioridade para fatos com potencial de cobrança: políticas públicas, economia, meio ambiente, ciência, relações internacionais.',
    },
    {
      icon: 'lightbulb',
      title: 'Contexto, não só manchete',
      text: 'Cada tema explica o que aconteceu, por que importa e como pode se relacionar com o conteúdo do edital.',
    },
    {
      icon: 'mapPin',
      title: 'Personalizado por região',
      text: 'Você escolhe estado e cidade e recebe também o que aconteceu perto de você.',
    },
    {
      icon: 'calendarRange',
      title: 'Pronto para revisar',
      text: 'Compilados semanais e mensais reúnem o período inteiro para revisões rápidas antes da prova.',
    },
    {
      icon: 'clock',
      title: 'Leitura de minutos',
      text: 'Textos objetivos, pensados para caber na rotina de quem estuda e trabalha.',
    },
    {
      icon: 'shield',
      title: 'Fontes identificadas',
      text: 'Os materiais indicam as fontes consultadas para você conferir quando quiser aprofundar.',
    },
  ] satisfies { icon: IconName; title: string; text: string }[],
}

export const howItWorks = {
  eyebrow: 'Como funciona',
  title: 'Do noticiário ao seu PDF',
  titleHighlight: 'em quatro passos.',
  steps: [
    {
      icon: 'mapPin',
      title: 'Você se cadastra',
      text: 'Assina e informa estado e cidade para personalizar as atualidades regionais.',
    },
    {
      icon: 'search',
      title: 'A IA monitora as fontes',
      text: 'Fontes de notícias são acompanhadas continuamente em busca de acontecimentos relevantes.',
    },
    {
      icon: 'brain',
      title: 'Seleção e análise',
      text: 'Os fatos são classificados por relevância para concursos e organizados com contexto.',
    },
    {
      icon: 'fileText',
      title: 'Você recebe o material',
      text: 'PDFs diários, semanais e mensais prontos para leitura e revisão.',
    },
  ] satisfies { icon: IconName; title: string; text: string }[],
}

export const coverage = {
  eyebrow: 'Cobertura',
  title: 'Três camadas de atualidades,',
  titleHighlight: 'um só material.',
  levels: [
    {
      icon: 'building',
      tag: 'Regional',
      title: 'Seu estado e sua cidade',
      text: 'O que bancas de concursos estaduais e municipais costumam cobrar e quase ninguém organiza.',
      topics: ['Governo e políticas estaduais', 'Economia regional', 'Infraestrutura e serviços', 'Meio ambiente local'],
    },
    {
      icon: 'flag',
      tag: 'Nacional',
      title: 'Os principais fatos do Brasil',
      text: 'Decisões, leis e acontecimentos com maior repercussão no país.',
      topics: ['Legislação e Judiciário', 'Economia e indicadores', 'Saúde e educação', 'Ciência e tecnologia'],
    },
    {
      icon: 'globe',
      tag: 'Internacional',
      title: 'O mundo que cai na prova',
      text: 'Geopolítica, acordos e eventos globais explicados de forma objetiva.',
      topics: ['Relações internacionais', 'Conflitos e diplomacia', 'Clima e sustentabilidade', 'Organismos internacionais'],
    },
  ] satisfies { icon: IconName; tag: string; title: string; text: string; topics: string[] }[],
}

export const materials = {
  eyebrow: 'Materiais',
  title: 'Um ritmo de estudo',
  titleHighlight: 'para cada momento.',
  items: [
    {
      icon: 'fileText',
      cadence: 'Diário',
      title: 'Material diário',
      text: 'Os acontecimentos mais relevantes do dia, com contexto e relação com provas.',
      bullets: ['Leitura rápida', 'Regional, nacional e internacional', 'Pontos de atenção para prova'],
    },
    {
      icon: 'calendar',
      cadence: 'Semanal',
      title: 'Compilado semanal',
      text: 'Os destaques da semana reunidos em um único documento para revisão.',
      bullets: ['Resumo dos principais temas', 'Organizado por assunto', 'Ideal para o fim de semana'],
    },
    {
      icon: 'calendarRange',
      cadence: 'Mensal',
      title: 'Compilado mensal',
      text: 'O panorama completo do mês, pronto para revisões de véspera.',
      bullets: ['Visão consolidada do mês', 'Linha do tempo dos fatos', 'Revisão antes da prova'],
    },
  ] satisfies { icon: IconName; cadence: string; title: string; text: string; bullets: string[] }[],
}

export const pdfDemo = {
  eyebrow: 'Demonstração',
  title: 'Veja como o material',
  titleHighlight: 'é organizado.',
  description:
    'Ilustração da estrutura dos PDFs. Os temas abaixo são exemplos fictícios usados apenas para mostrar o formato.',
  sections: [
    { label: 'O que aconteceu', text: 'Resumo objetivo do fato, com data e fonte.' },
    { label: 'Contexto', text: 'Antecedentes e conceitos necessários para entender o tema.' },
    { label: 'Por que importa para a prova', text: 'Relação com disciplinas e assuntos frequentes em editais.' },
    { label: 'Pontos de atenção', text: 'Termos, números e nomes que merecem ser memorizados.' },
  ],
}

export const faq = {
  eyebrow: 'Dúvidas',
  title: 'Perguntas',
  titleHighlight: 'frequentes.',
  items: [
    {
      question: 'O que eu recebo ao assinar?',
      answer:
        'Acesso aos materiais em PDF: diário, compilado semanal e compilado mensal, com atualidades regionais (do estado e da cidade escolhidos), nacionais e internacionais.',
    },
    {
      question: 'Como funcionam as atualidades regionais?',
      answer:
        'No cadastro você informa seu estado e sua cidade. O material passa a incluir acontecimentos relevantes dessa região, além dos destaques nacionais e internacionais.',
    },
    {
      question: 'O material substitui meus livros ou cursos?',
      answer:
        'Não. O AtualidadeAI é um complemento focado em atualidades. Ele organiza os fatos recentes para que você gaste menos tempo procurando e mais tempo estudando.',
    },
    {
      question: 'Como a inteligência artificial é usada?',
      answer:
        'A IA ajuda a monitorar fontes de notícias, identificar acontecimentos relevantes e organizar o conteúdo com foco em concursos. Os materiais indicam as fontes consultadas.',
    },
    {
      question: 'Quanto custa?',
      answer:
        `A assinatura custa ${formatBRL(plan.priceCents)} por mês e inclui todos os materiais: diário, semanal e mensal, com atualidades regionais, nacionais e internacionais.`,
    },
    {
      question: 'Quais formas de pagamento são aceitas?',
      answer:
        'Os pagamentos são processados com segurança pelo Mercado Pago. As formas disponíveis são exibidas no momento da contratação. Nenhum dado de cartão fica armazenado no AtualidadeAI.',
    },
    {
      question: 'Posso cancelar a assinatura?',
      answer:
        'Sim. As regras de cancelamento e renovação estarão descritas nos Termos de Uso, disponíveis antes da contratação.',
    },
  ],
}

export const finalCta = {
  title: 'Pare de garimpar notícias.',
  titleHighlight: 'Comece a revisar.',
  text: 'Assine e receba as atualidades organizadas para o seu concurso.',
  cta: { label: 'Assinar agora', href: '#planos' },
}
