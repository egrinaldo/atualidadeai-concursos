/**
 * Informações institucionais reutilizadas em toda a aplicação.
 * Altere aqui nome, slogan e contatos — os componentes leem deste arquivo.
 */
export const site = {
  name: 'AtualidadeAI Concursos',
  shortName: 'AtualidadeAI',
  tagline: 'Atualidades para concursos, organizadas por inteligência artificial.',
  // Preencher com dados reais quando disponíveis. Não inventar contatos.
  // Enquanto vazio, o rodapé não exibe o e-mail.
  contactEmail: 'atualidadeaiconcursos@gmail.com',
  // Razão social / CNPJ: exibidos no rodapé quando preenchidos.
  legalName: 'AtualidadeAIconcursos',
  cnpj: '', // não exibido por decisão do responsável
  // Canal do encarregado de dados (LGPD, art. 41); vazio = usa contactEmail
  dpoEmail: '',
  socials: {} as Record<string, string>,
} as const
