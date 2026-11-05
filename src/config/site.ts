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
  contactEmail: '',
  // Razão social / CNPJ: exibidos no rodapé quando preenchidos.
  legalName: '',
  cnpj: '', // CNPJ, ou CPF se o fornecedor for pessoa física
  // Endereço completo do fornecedor (exigido pelo Decreto 7.962/2013, art. 2º)
  address: '',
  // Encarregado de dados (LGPD, art. 41) — nome e e-mail do canal de privacidade
  dpoName: '',
  dpoEmail: '',
  socials: {} as Record<string, string>,
} as const
