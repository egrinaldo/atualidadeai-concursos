/**
 * Regras editoriais da triagem. Todas operam sobre texto "dobrado" (minúsculas, sem acentos — ver text.ts/fold).
 * Cada regra tem um rótulo legível, gravado em news.triage_reasons para auditoria e ajuste.
 */

export type Rule = { label: string; re: RegExp; points: number }

/** Itens que não são notícia para o produto: descartados com o motivo registrado. */
export const NOISE: { label: string; re: RegExp }[] = [
  { label: 'conteúdo em áudio/vídeo (sem texto para análise)', re: /^(audio|video|podcast|live)\s*[:|–-]/ },
  { label: 'boletim/agenda diária', re: /^(daily press briefing|daily news\b|press briefing|agenda d[oa]|programacao d[oa])/ },
  { label: 'registro de sessão sem conteúdo', re: /^(secao das sessoes|\d+(st|nd|rd|th) meeting|security council, \d+)/ },
  { label: 'ata/registro de reunião', re: /\b\d{4,5}(st|nd|rd|th) meeting\b/ },
  { label: 'aviso de expediente', re: /\b(prazos processuais|recesso|expediente|ponto facultativo)\b.*\b(suspens|altera|ficam)/ },
]

/** Assuntos que costumam cair em provas de atualidades: somam pontos. O primeiro (lei aprovada) também fixa o alcance nacional. */
export const BOOST: Rule[] = [
  { label: 'lei/MP/PEC aprovada ou sancionada', re: /\b(sancion|promulg|(camara|senado|congresso|plenario|deputados|senadores) (aprova|conclui|rejeita|derruba))/, points: 22 },
  { label: 'medida provisória/decreto/regulamentação', re: /\b(medida provisoria|\bmp\b (define|cria|institui|regulament|amplia|altera)|decreto|regulament)/, points: 16 },
  { label: 'decisão do STF/tribunal superior', re: /\b(stf|supremo|stj|tse|tst)\b.*\b(decide|julga|forma maioria|declara|suspende|valida|derruba|mantem|marca|determina)/, points: 18 },
  { label: 'indicador econômico oficial', re: /\b(selic|copom|ipca|inflacao|pib|desocupacao|desemprego|producao industrial|industria (nacional )?recua|balanca comercial|cambio|dolar)\b/, points: 18 },
  { label: 'política fiscal/tributária', re: /\b(imposto|tribut|reforma tributaria|arcabouco|orcamento|fiscal|divida publica|carga tributaria)/, points: 12 },
  { label: 'eleições/mudança de governo', re: /\b(eleic\w*|eleit[oa]s?|renuncia\w*|posse|impeachment|elections?|elected|resigns?)\b/, points: 14 },
  { label: 'organismo/cúpula internacional', re: /\b(onu|nacoes unidas|united nations|security council|conselho de seguranca|general assembly|otan|nato|g20|g7|brics|mercosul|cupula|summit|cop ?\d{2}|oms|who\b|omc|wto)\b/, points: 12 },
  { label: 'acordo/tratado/sanção internacional', re: /\b(acordo|tratado|agreement|treaty|sancoes|sanctions|tarifa|tarifaco|tariffs?|safeguard)\b/, points: 10 },
  { label: 'conflito/crise internacional', re: /\b(guerra|war|conflito|conflict|cessar-fogo|ceasefire|crise|crisis|ataque|attack)\b/, points: 10 },
  { label: 'política pública/programa nacional', re: /\b(programa nacional|politica nacional|plano nacional|governo (federal )?(anuncia|lanca|cria|define)|ministerio d[aoe]s? .+ (anuncia|lanca|vai))/, points: 10 },
  { label: 'comissão aprova projeto', re: /\bcomissao (mista )?(de [a-z ]+ )?aprova/, points: 8 },
  { label: 'saúde pública', re: /\b(sus\b|vacin|epidemi|pandemi|surto|mpox|dengue|outbreak|vaccine)/, points: 10 },
  { label: 'meio ambiente/clima', re: /\b(clima|climat\w*|desmatamento|amazonia|emissoes|aquecimento global|sea-level|temporais|enchentes?|seca)\b/, points: 10 },
  { label: 'direitos e grupos vulneráveis', re: /\b(direitos humanos|human rights|violencia (domestica|contra a mulher)|criancas e adolescentes|pessoas com deficiencia|igualdade|racismo|indigenas)\b/, points: 8 },
  { label: 'tecnologia/IA/dados', re: /\b(inteligencia artificial|\bia\b|artificial intelligence|ciberseguranca|vazamento de dados|dados pessoais|lgpd)\b/, points: 8 },
  { label: 'segurança pública/operação', re: /\b(operacao (policial|contra)|faccao|maioridade penal|prisoes|homicidio|fraudes?)\b/, points: 6 },
  { label: 'concursos/seleções públicas', re: /\b(concurso|edital|processo seletivo|selecao|recenseador|vagas)\b/, points: 8 },
  { label: 'dado com número/percentual', re: /\d+(,\d+)?\s?%|r\$ ?\d/, points: 4 },
]

/** Pauta institucional, promocional ou de entretenimento: perde pontos. */
export const PENALTY: Rule[] = [
  { label: 'homenagem/premiação', re: /\b(homenage|premio|premiacao|medalha|condecor|vencedores)/, points: -24 },
  { label: 'evento/curso/capacitação', re: /\b(seminario|congresso brasileiro|congresso d[eo] |xi+ congresso|curso|capacita\w*|palestras?|workshop|webinar|semana d[aeo]|encontro\b|feira|visita guiada|conferencia d[oa]|mostra)\b/, points: -18 },
  { label: 'divulgação institucional', re: /\b(inscricoes|prorrogad\w*|participe|confira|saiba como|novo site|portal .*(cara nova|novidades)|revista|livro|publicacao|cartilha|lanca (guia|livro|revista)|factsheet)\b/, points: -14 },
  { label: 'esporte/entretenimento', re: /\b(futebol|campeonato|copa d[oe]|jiu-jitsu|olimpiad\w*|atletas?|torneio|show|festival)\b/, points: -18 },
  { label: 'discurso/pronunciamento sem fato novo', re: /^(remarks by|speech by|keynote|statement by|opening remarks)\b/, points: -12 },
]

/** Categorias (códigos de news_categories) por palavras-chave; maior soma vence. */
export const CATEGORY_RULES: { code: string; re: RegExp }[] = [
  { code: 'legislacao', re: /\b(projeto de lei|projeto|lei\b|leis\b|sancion|veto|medida provisoria|\bmp\b|pec\b|emenda constitucional|decreto|regulament|plenario|comissao|stf|supremo|tribunal|julgament|constituc|codigo)/g },
  { code: 'economia', re: /\b(economi|juros?|selic|copom|inflac|ipca|pib\b|dolar|cambio|imposto|tribut|fiscal|orcament|divida|industri|desocupac|desemprego|emprego|credito|banco central|mercado|export|import|comercio|tarifa|trade|tariff|investiment|investor|financ|bancari|consumidor)/g },
  { code: 'educacao', re: /\b(educac|escola|ensino|enem|\bmec\b|universidad|professor|alunos?|estudantes?|creche|pos-graduacao|education|school)/g },
  { code: 'saude', re: /\b(saude|\bsus\b|vacin|hospital|doenc|epidem|pandem|medicament|mpox|dengue|anvisa|insulina|health|disease|amamentac|posto de saude)/g },
  { code: 'seguranca_publica', re: /\b(seguranca publica|policia|crimes?\b|criminos|violencia|homicid|faccao|prisao|prisoes|presos?\b|trafico|fraude|operacao (policial|contra)|maioridade penal|guardas? municipa|golpe)/g },
  { code: 'meio_ambiente', re: /\b(ambient|clima|climat|desmatament|amazonia|cop ?\d{2}|emissoes|carbono|sustentab|enchente|temporais|seca\b|ocean|sea-level|biodivers|fishing|pesca|ribeirinho)/g },
  { code: 'tecnologia', re: /\b(tecnolog|inteligencia artificial|\bia\b|digital|internet|ciberseg|cyber|software|startup|inovac|innovation|dados)/g },
  { code: 'ciencia', re: /\b(cienc|pesquisa|cientist|espacial|research|science|scientist|descoberta)/g },
  { code: 'relacoes_internacionais', re: /\b(diplomac|embaixad|itamaraty|\bonu\b|nacoes unidas|united nations|security council|general assembly|otan|nato|brics|g20|mercosul|cupula|summit|acordo internacional|tratado|guerra|sanction|ukraine|ucrania|israel|gaza|cooperacao internacional|relacoes exteriores|geopolitic)/g },
  { code: 'direitos_humanos', re: /\b(direitos humanos|human rights|discrimin|racism|igualdade|genero|mulheres|violencia domestica|criancas|adolescentes|idosos|deficiencia|indigen|quilombol|refugiad|migrant|lgbt|inclusao)/g },
  { code: 'administracao_publica', re: /\b(administracao publica|servidor(es)? (publicos?|municipais)|servidores|concurso|licitac|\btcu\b|tribunal de contas|controladoria|\bcgu\b|auditoria|gestao publica|orgaos? public|transparencia|fiscalizac|recenseador|edital|controle externo|censo\b|ibge)/g },
  { code: 'sociedade', re: /\b(social|populacao|familia|pobreza|bolsa familia|desigualdade|moradia|trabalhador|escala 6x1|ambulantes|consumidor)/g },
  { code: 'infraestrutura', re: /\b(infraestrutura|obras?\b|rodovi|ferrovi|porto\b|aeroport|saneament|energia|eletric|conta de luz|abastecimento de agua|cagece|minerais|petrol|transito|asfalt)/g },
  { code: 'cultura', re: /\b(cultur|artes?\b|artista|musica|cinema|patrimoni|artesanato|museu)/g },
  { code: 'politica_nacional', re: /\b(congresso|senado|camara dos deputados|deputad|senador|planalto|lula|presidente da republica|ministr[oa]|governo federal|partidos?\b|eleic)/g },
]

/** Estados brasileiros (texto dobrado → UF). Capitais ambíguas (Natal, Palmas, Vitória, Salvador) ficam de fora. */
export const STATES: { uf: string; re: RegExp }[] = [
  { uf: 'AC', re: /\b(acre|rio branco)\b/ },
  { uf: 'AL', re: /\b(alagoas|maceio)\b/ },
  { uf: 'AP', re: /\b(amapa|macapa)\b/ },
  { uf: 'AM', re: /\b(estado do amazonas|manaus)\b/ },
  { uf: 'BA', re: /\b(bahia)\b/ },
  { uf: 'CE', re: /\b(ceara|cearense|cearenses|fortaleza|cagece)\b/ },
  { uf: 'DF', re: /\b(distrito federal|brasilia)\b/ },
  { uf: 'ES', re: /\b(espirito santo)\b/ },
  { uf: 'GO', re: /\b(goias|goiania)\b/ },
  { uf: 'MA', re: /\b(maranhao|sao luis)\b/ },
  { uf: 'MS', re: /\b(mato grosso do sul|campo grande)\b/ },
  { uf: 'MT', re: /\b(mato grosso(?! do sul)|cuiaba)\b/ },
  { uf: 'MG', re: /\b(minas gerais|belo horizonte)\b/ },
  { uf: 'PB', re: /\b(paraiba|joao pessoa)\b/ },
  { uf: 'PR', re: /\b(parana|curitiba)\b/ },
  { uf: 'PE', re: /\b(pernambuco|recife)\b/ },
  { uf: 'PI', re: /\b(piaui|teresina)\b/ },
  { uf: 'RJ', re: /\b(rio de janeiro)\b/ },
  { uf: 'RN', re: /\b(rio grande do norte)\b/ },
  { uf: 'RS', re: /\b(rio grande do sul|porto alegre)\b/ },
  { uf: 'RO', re: /\b(rondonia|porto velho)\b/ },
  { uf: 'RR', re: /\b(roraima|boa vista)\b/ },
  { uf: 'SC', re: /\b(santa catarina|florianopolis)\b/ },
  { uf: 'SP', re: /\b(sao paulo)\b/ },
  { uf: 'SE', re: /\b(sergipe|aracaju)\b/ },
  { uf: 'TO', re: /\b(tocantins)\b/ },
]
/** "Pará" só com acento (no texto original), para não confundir com a preposição "para". */
export const PARA_STATE = /(?<!\p{L})(Pará|paraense|Belém)(?!\p{L})/u // \b do JS não reconhece letras acentuadas
/** Siglas entre parênteses: "Natal (RN)". */
export const UF_PAREN = /\((AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MS|MT|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\)/g

/** Países, blocos e líderes estrangeiros: indicam pauta internacional quando o Brasil não é citado. */
export const FOREIGN = /\b(estados unidos|eua|norte-americano|trump|china|chines|russia|putin|ucrania|zelensky|israel|gaza|palestin|ira\b|argentina|milei|paraguai|uruguai|chile|bolivia|peru\b|colombia|venezuela|mexico|canada|cuba|japao|india\b|coreia|alemanha|franca\b|reino unido|italia|espanha|portugal|uniao europeia|europa|oriente medio|africa|buenos aires|otan)\b/
export const BRAZIL = /\b(brasil|brasileir|nacional|federal|sus\b|lula|congresso|senado|camara|comissao|plenario|deputad|senador|ministr|governo|stf|tcu|ibge|banco central|exportador|agroexportador)/
