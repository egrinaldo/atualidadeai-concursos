/**
 * Termos de Uso e Política de Privacidade.
 *
 * Os dados do fornecedor/controlador vêm de src/config/site.ts. Enquanto um
 * campo estiver vazio, a página mostra um aviso destacado "[a preencher]" —
 * nunca um dado inventado. Ao alterar o conteúdo, atualize `LEGAL_VERSION`
 * e `LEGAL_EFFECTIVE_DATE`.
 *
 * Marcadores aceitos no texto: {{empresa}}, {{documento}}, {{endereco}},
 * {{email}}, {{encarregado}}, {{emailEncarregado}}, {{site}}, {{preco}}.
 */

export const LEGAL_VERSION = '1.0'
export const LEGAL_EFFECTIVE_DATE = '05/11/2026'

export type LegalBlock = { p: string } | { ul: string[] } | { note: string }
export type LegalSection = { id: string; title: string; blocks: LegalBlock[] }
export type LegalDocument = { title: string; intro: string; sections: LegalSection[] }

export const termsOfUse: LegalDocument = {
  title: 'Termos de Uso',
  intro:
    'Estes Termos de Uso regulam o acesso e a utilização da plataforma AtualidadeAI Concursos e a contratação da assinatura oferecida. Leia-os com atenção: ao criar uma conta ou contratar a assinatura, você declara que leu, compreendeu e aceitou integralmente estas condições.',
  sections: [
    {
      id: 'identificacao',
      title: '1. Identificação do fornecedor e aceitação',
      blocks: [
        {
          p: 'A plataforma AtualidadeAI Concursos ("Plataforma") é disponibilizada por {{empresa}}, inscrito(a) sob o nº {{documento}}, com endereço em {{endereco}}, e-mail de atendimento {{email}} ("Fornecedor"), em conformidade com o art. 2º do Decreto nº 7.962/2013.',
        },
        {
          p: 'A aceitação destes Termos ocorre de forma eletrônica, mediante a marcação da caixa de concordância no cadastro, e é registrada com data e hora. A relação entre o Fornecedor e o usuário é regida pelo Código de Defesa do Consumidor (Lei nº 8.078/1990), pelo Marco Civil da Internet (Lei nº 12.965/2014), pela Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — "LGPD") e pelo Decreto nº 7.962/2013.',
        },
        {
          p: 'A Plataforma destina-se a pessoas maiores de 18 (dezoito) anos e civilmente capazes. Menores de idade somente podem utilizá-la com a assistência ou representação de seus pais ou responsáveis legais, que respondem pelo cadastro e pela contratação.',
        },
      ],
    },
    {
      id: 'definicoes',
      title: '2. Definições',
      blocks: [
        {
          ul: [
            'Usuário: pessoa física que cria uma conta na Plataforma.',
            'Assinante: usuário com assinatura ativa e pagamento confirmado.',
            'Materiais: conteúdos de atualidades disponibilizados pela Plataforma, inclusive arquivos em PDF de periodicidade diária, semanal e mensal.',
            'Área do assinante: espaço da Plataforma acessível após login ("Minha conta").',
            'Ciclo: período mensal de vigência da assinatura, contado a partir da confirmação do pagamento.',
          ],
        },
      ],
    },
    {
      id: 'objeto',
      title: '3. Objeto do serviço',
      blocks: [
        {
          p: 'A Plataforma oferece, mediante assinatura, materiais de estudo com atualidades regionais, nacionais e internacionais selecionadas e organizadas com o apoio de ferramentas de inteligência artificial, voltados à preparação para concursos públicos, considerando o estado e o município informados pelo usuário.',
        },
        {
          p: 'Os materiais são disponibilizados em formato digital, na Área do assinante e/ou por e-mail, conforme a periodicidade descrita na página de apresentação da Plataforma. O Fornecedor poderá aprimorar o formato, o layout e a organização dos materiais, preservando a natureza do serviço contratado.',
        },
      ],
    },
    {
      id: 'conta',
      title: '4. Cadastro e conta',
      blocks: [
        {
          ul: [
            'O usuário deve fornecer informações verdadeiras, exatas e atualizadas, respondendo pela veracidade dos dados informados.',
            'A conta é pessoal e intransferível. É vedado compartilhar login e senha ou permitir o acesso de terceiros aos Materiais.',
            'O usuário é responsável por manter a confidencialidade da sua senha e deve comunicar imediatamente ao Fornecedor qualquer uso não autorizado da conta.',
            'A confirmação do endereço de e-mail é necessária para a ativação da conta e a contratação da assinatura.',
          ],
        },
      ],
    },
    {
      id: 'assinatura',
      title: '5. Assinatura, preço e pagamento',
      blocks: [
        {
          p: 'A assinatura tem valor de {{preco}} por mês, com renovação automática a cada Ciclo até que seja cancelada pelo Assinante. O preço vigente é sempre informado de forma clara antes da contratação.',
        },
        {
          p: 'Os pagamentos são processados pelo Mercado Pago (Mercado Pago Instituição de Pagamento Ltda.), em ambiente próprio e seguro. O Fornecedor não coleta nem armazena dados de cartão de crédito. A assinatura somente é ativada após a confirmação do pagamento pelo Mercado Pago.',
        },
        {
          p: 'Eventual reajuste de preço será comunicado por e-mail com antecedência mínima de 30 (trinta) dias e somente será aplicado a partir do Ciclo seguinte, sendo facultado ao Assinante cancelar a assinatura antes da cobrança reajustada, sem qualquer ônus.',
        },
        {
          p: 'A recusa ou o estorno do pagamento pela instituição financeira poderá implicar a suspensão do acesso aos Materiais até a regularização.',
        },
      ],
    },
    {
      id: 'arrependimento',
      title: '6. Direito de arrependimento (cancelamento em até 7 dias)',
      blocks: [
        {
          p: 'Nos termos do art. 49 do Código de Defesa do Consumidor, o Assinante pode desistir da contratação no prazo de 7 (sete) dias corridos, contados da data da contratação, sem necessidade de justificativa.',
        },
        {
          p: 'Exercido o direito de arrependimento dentro do prazo, o Fornecedor devolverá integralmente os valores pagos, monetariamente atualizados (art. 49, parágrafo único, do CDC), e comunicará imediatamente o Mercado Pago e/ou a administradora do cartão para que a transação não seja lançada na fatura ou seja efetivado o estorno (art. 5º, § 3º, do Decreto nº 7.962/2013). O prazo para o crédito aparecer na fatura ou na conta depende do meio de pagamento utilizado.',
        },
        {
          p: 'O direito de arrependimento pode ser exercido pelo mesmo meio utilizado na contratação — opção "Cancelar assinatura" na Área do assinante — ou pelo e-mail {{email}}. O Fornecedor confirmará imediatamente o recebimento da manifestação (art. 5º, § 4º, do Decreto nº 7.962/2013).',
        },
      ],
    },
    {
      id: 'cancelamento',
      title: '7. Cancelamento após o prazo de arrependimento',
      blocks: [
        {
          p: 'Após o prazo de 7 (sete) dias, o Assinante pode cancelar a assinatura a qualquer momento, sem multa e sem período mínimo de permanência, diretamente na Área do assinante.',
        },
        {
          ul: [
            'O cancelamento interrompe as cobranças futuras de forma imediata.',
            'Não há reembolso proporcional do Ciclo em curso, já pago, salvo nas hipóteses de falha na prestação do serviço imputável ao Fornecedor, nos termos do CDC.',
            'O acesso aos Materiais do Ciclo já pago é mantido até o fim desse Ciclo.',
          ],
        },
      ],
    },
    {
      id: 'conteudo',
      title: '8. Natureza do conteúdo e uso de inteligência artificial',
      blocks: [
        {
          p: 'Os Materiais têm caráter informativo e de apoio aos estudos. São elaborados a partir de notícias e informações de fontes públicas, selecionadas e organizadas com o auxílio de inteligência artificial e sujeitas a processos de revisão.',
        },
        {
          ul: [
            'Os Materiais não substituem a leitura do edital, da legislação e das fontes oficiais, que prevalecem em caso de divergência.',
            'A utilização da Plataforma não garante aprovação em concurso público, que depende de fatores alheios ao Fornecedor.',
            'Apesar dos cuidados adotados, conteúdos produzidos com apoio de inteligência artificial podem conter imprecisões. O usuário pode comunicá-las pelo e-mail {{email}}, e o Fornecedor se compromete a analisá-las e, sendo o caso, corrigi-las com a maior brevidade possível.',
          ],
        },
      ],
    },
    {
      id: 'propriedade',
      title: '9. Propriedade intelectual',
      blocks: [
        {
          p: 'A marca, o layout, os textos, a seleção, a organização e os Materiais da Plataforma são protegidos pela Lei de Direitos Autorais (Lei nº 9.610/1998) e pela Lei de Propriedade Industrial (Lei nº 9.279/1996). As notícias de terceiros utilizadas como fonte permanecem de titularidade de seus respectivos autores e veículos, que são devidamente referenciados.',
        },
        {
          p: 'A assinatura concede ao Assinante licença pessoal, não exclusiva e intransferível para acessar e utilizar os Materiais exclusivamente para estudo próprio. É vedado reproduzir, distribuir, revender, publicar, compartilhar em grupos ou redes, ou disponibilizar os Materiais a terceiros, no todo ou em parte, sem autorização prévia e por escrito do Fornecedor.',
        },
      ],
    },
    {
      id: 'condutas',
      title: '10. Condutas proibidas',
      blocks: [
        {
          ul: [
            'Utilizar a Plataforma para fins ilícitos ou contrários a estes Termos.',
            'Tentar acessar áreas, dados ou contas de outros usuários, ou burlar mecanismos de segurança e de pagamento.',
            'Utilizar robôs, scripts ou qualquer meio automatizado para coletar conteúdos ou sobrecarregar a Plataforma.',
            'Fornecer dados falsos ou de terceiros sem autorização.',
          ],
        },
        {
          p: 'O descumprimento destas regras poderá acarretar a suspensão ou o encerramento da conta, sem prejuízo das medidas legais cabíveis, assegurado ao usuário o direito de apresentar esclarecimentos.',
        },
      ],
    },
    {
      id: 'disponibilidade',
      title: '11. Disponibilidade e atendimento',
      blocks: [
        {
          p: 'O Fornecedor emprega os melhores esforços para manter a Plataforma disponível e segura, podendo realizar manutenções programadas ou emergenciais. Indisponibilidades prolongadas que impeçam a entrega dos Materiais do Ciclo pago serão compensadas de forma proporcional.',
        },
        {
          p: 'O atendimento ao usuário é realizado pelo e-mail {{email}}. As demandas serão respondidas em até 5 (cinco) dias, nos termos do art. 4º, parágrafo único, do Decreto nº 7.962/2013.',
        },
      ],
    },
    {
      id: 'responsabilidade',
      title: '12. Responsabilidades',
      blocks: [
        {
          p: 'O Fornecedor responde pela prestação do serviço nos termos da legislação de defesa do consumidor. Nenhuma disposição destes Termos exclui ou atenua responsabilidades que não possam ser afastadas por lei.',
        },
        {
          p: 'O Fornecedor não se responsabiliza por danos decorrentes do uso indevido da conta por culpa exclusiva do usuário ou de terceiros, nem por falhas de conexão, equipamentos ou serviços de terceiros que não estejam sob o seu controle.',
        },
      ],
    },
    {
      id: 'privacidade',
      title: '13. Privacidade e proteção de dados',
      blocks: [
        {
          p: 'O tratamento de dados pessoais realizado pela Plataforma é descrito na Política de Privacidade, disponível em {{site}}/privacidade, que integra estes Termos.',
        },
      ],
    },
    {
      id: 'comunicacoes',
      title: '14. Comunicações',
      blocks: [
        {
          p: 'As comunicações relativas à conta, à assinatura e aos pagamentos serão enviadas para o e-mail cadastrado pelo usuário, que deve mantê-lo atualizado e verificar regularmente sua caixa de entrada e de spam.',
        },
      ],
    },
    {
      id: 'alteracoes',
      title: '15. Alterações destes Termos',
      blocks: [
        {
          p: 'Estes Termos podem ser atualizados para refletir alterações legais ou do serviço. Alterações relevantes serão comunicadas por e-mail e/ou aviso na Plataforma com antecedência mínima de 15 (quinze) dias. Caso o usuário não concorde com a nova versão, poderá cancelar a assinatura sem ônus antes de sua vigência.',
        },
      ],
    },
    {
      id: 'foro',
      title: '16. Legislação aplicável e foro',
      blocks: [
        {
          p: 'Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro do domicílio do consumidor para dirimir eventuais controvérsias, nos termos do art. 101, inciso I, do Código de Defesa do Consumidor, sem prejuízo da possibilidade de solução amigável pelo e-mail {{email}} ou pela plataforma consumidor.gov.br.',
        },
      ],
    },
  ],
}

export const privacyPolicy: LegalDocument = {
  title: 'Política de Privacidade',
  intro:
    'Esta Política de Privacidade descreve como a AtualidadeAI Concursos coleta, utiliza, compartilha, armazena e protege dados pessoais, em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — "LGPD"), o Marco Civil da Internet (Lei nº 12.965/2014) e as normas da Autoridade Nacional de Proteção de Dados (ANPD).',
  sections: [
    {
      id: 'controlador',
      title: '1. Controlador e encarregado',
      blocks: [
        {
          p: 'O controlador dos dados pessoais tratados na Plataforma é {{empresa}}, inscrito(a) sob o nº {{documento}}, com endereço em {{endereco}} ("Controlador").',
        },
        {
          p: 'O encarregado pelo tratamento de dados pessoais (art. 41 da LGPD) é {{encarregado}}, que pode ser contatado pelo e-mail {{emailEncarregado}} para qualquer assunto relacionado a esta Política e aos seus direitos como titular.',
        },
      ],
    },
    {
      id: 'dados',
      title: '2. Dados pessoais tratados',
      blocks: [
        { p: 'Tratamos somente os dados necessários às finalidades descritas nesta Política (princípio da necessidade, art. 6º, III, da LGPD):' },
        {
          ul: [
            'Dados de cadastro: nome completo, e-mail, estado (UF) e município, data e hora do aceite dos Termos de Uso e desta Política. A senha é armazenada exclusivamente em formato criptografado irreversível (hash) e nunca é acessível ao Controlador.',
            'Dados de interessados: nome, e-mail, UF e município informados ao iniciar o cadastro na Plataforma, ainda que o cadastro não seja concluído.',
            'Dados de assinatura e pagamento: e-mail da conta do Mercado Pago informada para o pagamento, identificadores da assinatura e das transações, valor, status e datas. Dados de cartão são coletados e tratados exclusivamente pelo Mercado Pago e não são recebidos nem armazenados pelo Controlador.',
            'Dados de comunicação: registro dos e-mails transacionais enviados (tipo, assunto, data e situação do envio).',
            'Dados técnicos e de segurança: endereço IP, data e hora de acesso, dados da sessão de login armazenados no navegador e registros de autenticação, inclusive o fator de verificação em duas etapas de contas administrativas.',
          ],
        },
        {
          p: 'A Plataforma não trata dados pessoais sensíveis (art. 5º, II, da LGPD) e não utiliza cookies de publicidade ou de rastreamento. São utilizados apenas recursos de armazenamento local do navegador estritamente necessários para manter o usuário conectado e para o funcionamento das páginas.',
        },
      ],
    },
    {
      id: 'finalidades',
      title: '3. Finalidades e bases legais',
      blocks: [
        {
          ul: [
            'Criar e gerenciar a conta, autenticar o acesso e prestar o serviço contratado, inclusive a regionalização dos Materiais conforme UF e município — execução de contrato e de procedimentos preliminares (art. 7º, V, da LGPD).',
            'Processar a assinatura, os pagamentos, cancelamentos e reembolsos — execução de contrato (art. 7º, V).',
            'Enviar comunicações transacionais (confirmação de cadastro, recuperação de senha, confirmação de contratação e situação de pagamentos) — execução de contrato (art. 7º, V).',
            'Cumprir obrigações legais e regulatórias, inclusive fiscais, de defesa do consumidor e a guarda de registros de acesso — cumprimento de obrigação legal (art. 7º, II) e art. 15 do Marco Civil da Internet.',
            'Garantir a segurança da Plataforma e do titular, prevenir fraudes e abusos (como a limitação de tentativas por endereço IP) — legítimo interesse (art. 7º, IX, e art. 10 da LGPD).',
            'Entrar em contato com interessados que iniciaram o cadastro e não o concluíram, para auxiliá-los na conclusão — legítimo interesse (art. 7º, IX, e art. 10), assegurado o direito de oposição a qualquer tempo.',
            'Exercer direitos em processos judiciais, administrativos ou arbitrais — art. 7º, VI.',
          ],
        },
        {
          p: 'O Controlador não vende dados pessoais e não os utiliza para publicidade de terceiros. As ferramentas de inteligência artificial empregadas na elaboração dos Materiais processam conteúdos jornalísticos de fontes públicas e não são alimentadas com dados pessoais dos usuários.',
        },
      ],
    },
    {
      id: 'compartilhamento',
      title: '4. Compartilhamento de dados',
      blocks: [
        { p: 'Os dados pessoais são compartilhados apenas com os prestadores de serviço indispensáveis ao funcionamento da Plataforma, que atuam como operadores, ou de forma independente quando assim definido em lei:' },
        {
          ul: [
            'Supabase Inc.: hospedagem do banco de dados, autenticação e funções de servidor (operador).',
            'Vercel Inc.: hospedagem e entrega do site (operador).',
            'Mercado Pago Instituição de Pagamento Ltda.: processamento de pagamentos e assinaturas; trata dados de pagamento também como controlador, conforme sua própria política de privacidade.',
            'Resend (Plus Five Five, Inc.): envio de e-mails transacionais (operador).',
            'Autoridades públicas, mediante requisição legal ou ordem judicial.',
          ],
        },
      ],
    },
    {
      id: 'transferencia',
      title: '5. Transferência internacional',
      blocks: [
        {
          p: 'Alguns dos prestadores indicados acima armazenam ou processam dados em servidores localizados fora do Brasil, especialmente nos Estados Unidos da América. Essas transferências ocorrem com fundamento no art. 33 da LGPD — para a execução do contrato com o titular e mediante garantias contratuais de proteção de dados adotadas por esses prestadores — observando a regulamentação da ANPD (Resolução CD/ANPD nº 19/2024).',
        },
      ],
    },
    {
      id: 'retencao',
      title: '6. Prazos de armazenamento',
      blocks: [
        {
          ul: [
            'Dados de cadastro e assinatura: enquanto a conta estiver ativa; após a exclusão da conta, são eliminados, ressalvadas as hipóteses do art. 16 da LGPD.',
            'Registros de pagamentos: mantidos de forma desvinculada da identificação do titular após a exclusão da conta, pelo prazo exigido pela legislação fiscal e para o exercício regular de direitos (no mínimo 5 anos).',
            'Registros de acesso à aplicação: 6 (seis) meses, conforme o art. 15 do Marco Civil da Internet.',
            'Registros técnicos de notificações de pagamento: 12 (doze) meses.',
            'Registros de e-mails enviados: 24 (vinte e quatro) meses.',
            'Dados de interessados que não concluíram o cadastro: 24 (vinte e quatro) meses ou até o pedido de oposição ou eliminação.',
          ],
        },
        { p: 'A eliminação dos dados nos prazos acima é realizada por rotina automática.' },
      ],
    },
    {
      id: 'direitos',
      title: '7. Direitos do titular',
      blocks: [
        { p: 'Nos termos do art. 18 da LGPD, o titular pode, a qualquer momento e gratuitamente:' },
        {
          ul: [
            'confirmar a existência de tratamento e acessar seus dados;',
            'corrigir dados incompletos, inexatos ou desatualizados;',
            'solicitar a anonimização, o bloqueio ou a eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a LGPD;',
            'solicitar a portabilidade dos dados;',
            'solicitar a eliminação dos dados tratados, ressalvadas as hipóteses legais de conservação;',
            'obter informação sobre as entidades com as quais os dados são compartilhados;',
            'opor-se a tratamento realizado com base no legítimo interesse;',
            'revogar o consentimento, quando esta for a base legal aplicável.',
          ],
        },
        {
          p: 'Na Área do assinante ("Minha conta" → "Privacidade e dados") é possível baixar uma cópia dos seus dados e excluir sua conta de forma imediata. Os demais pedidos podem ser enviados ao encarregado pelo e-mail {{emailEncarregado}} e serão respondidos em até 15 (quinze) dias, conforme o art. 19, II, da LGPD. Para a sua segurança, poderemos solicitar a confirmação da identidade antes de atender o pedido.',
        },
        {
          p: 'O titular também tem o direito de peticionar à Autoridade Nacional de Proteção de Dados (ANPD) — www.gov.br/anpd.',
        },
      ],
    },
    {
      id: 'seguranca',
      title: '8. Segurança da informação',
      blocks: [
        { p: 'Adotamos medidas técnicas e administrativas aptas a proteger os dados pessoais (art. 46 da LGPD), entre elas:' },
        {
          ul: [
            'criptografia em trânsito (HTTPS/TLS, com HSTS) em todas as páginas e integrações;',
            'senhas armazenadas apenas em formato de hash, nunca em texto;',
            'controle de acesso por usuário no banco de dados (Row Level Security), de modo que cada usuário acesse somente os próprios dados;',
            'verificação em duas etapas obrigatória para contas administrativas;',
            'credenciais de serviços mantidas exclusivamente no servidor, nunca no navegador;',
            'limitação de tentativas e monitoramento de eventos de segurança;',
            'auditorias periódicas de segurança.',
          ],
        },
        {
          p: 'Em caso de incidente de segurança que possa acarretar risco ou dano relevante aos titulares, o Controlador comunicará a ANPD e os titulares afetados, nos termos do art. 48 da LGPD e da regulamentação aplicável.',
        },
      ],
    },
    {
      id: 'menores',
      title: '9. Crianças e adolescentes',
      blocks: [
        {
          p: 'A Plataforma é destinada a maiores de 18 anos. Caso seja identificado o cadastro de menor de idade sem a assistência de responsável legal, os dados poderão ser eliminados, observado o art. 14 da LGPD.',
        },
      ],
    },
    {
      id: 'alteracoes',
      title: '10. Alterações desta Política',
      blocks: [
        {
          p: 'Esta Política pode ser atualizada para refletir mudanças legais, regulatórias ou no funcionamento da Plataforma. Alterações relevantes serão comunicadas por e-mail e/ou aviso na Plataforma. A versão vigente e a data de atualização constam no topo desta página.',
        },
      ],
    },
    {
      id: 'contato',
      title: '11. Contato',
      blocks: [
        {
          p: 'Dúvidas, solicitações e reclamações sobre esta Política ou sobre o tratamento de dados pessoais podem ser enviadas ao encarregado pelo e-mail {{emailEncarregado}}. Atendimento geral: {{email}}.',
        },
      ],
    },
  ],
}
