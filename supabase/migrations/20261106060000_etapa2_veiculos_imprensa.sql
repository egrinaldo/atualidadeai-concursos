-- =====================================================================
-- Migração 17 — Etapa 2.5b: veículos de imprensa (nacionais, Ceará e internacionais)
-- Só acrescenta/ajusta cadastro; não apaga dados. Idempotente.
--
-- Regras (verificadas em 05–06/11/2026):
--   * coleta só por feed RSS/Atom ou mapa de notícias, nunca pela página da matéria;
--   * robots.txt respeitado, inclusive no destino de redirecionamentos;
--   * veículo cujos termos PROÍBEM expressamente robôs/raspagem fica INATIVO (motivo em terms_notes);
--   * content_mode = 'summary': guarda só título + resumo curto (≤ 400 caracteres), nunca o texto da matéria;
--   * a IA reescreve com texto próprio e cita veículo + link; cópia literal é recusada na validação.
-- =====================================================================

alter table public.news_sources add column if not exists content_mode text not null default 'full'
  check (content_mode in ('full', 'summary'));

-- Mapa de notícias (Google News sitemap) como novo tipo de fonte
alter table public.news_sources drop constraint if exists news_sources_source_type_check;
alter table public.news_sources add constraint news_sources_source_type_check
  check (source_type in ('rss', 'atom', 'api', 'html', 'sitemap'));

-- Grupos editoriais (matérias do mesmo grupo não contam como fontes independentes)
insert into public.news_source_groups (name, notes) values
  ('Grupo Folha (Folha e UOL)', null), ('Poder360', null), ('Grupo Abril', 'Veja'), ('Jovem Pan', null),
  ('CartaCapital', null), ('InfoMoney', null), ('Conjur', null), ('Grupo O Povo', null), ('CN7', null),
  ('Deutsche Welle', null), ('PRISA (El País)', null), ('Euronews', null), ('NPR', null),
  ('Estadão', null), ('Exame', null), ('Gazeta do Povo', null), ('Metrópoles', null),
  ('France Médias Monde (RFI, France 24)', null), ('JOTA', null), ('The Guardian', null),
  ('The New York Times', null), ('Al Jazeera', null), ('CNN (internacional)', null), ('Correio Braziliense', null)
on conflict (name) do nothing;

-- Já cadastrados como inativos na migração 13: ativar no modo resumo
update public.news_sources set is_active = true, content_mode = 'summary', name = 'G1 — Últimas',
       terms_notes = 'ATIVA (modo resumo): robots.txt permite; termos do G1 sem cláusula sobre robôs (lidos em 06/11/2026). Usamos só título + resumo curto, texto próprio com crédito e link. Revisar licença antes de clientes pagantes.'
 where feed_url = 'https://g1.globo.com/rss/g1/';
update public.news_sources set is_active = true, content_mode = 'summary',
       terms_notes = 'ATIVA (modo resumo): robots.txt permite; termos sem cláusula sobre robôs, mas restringem o conteúdo a uso pessoal/não comercial — RISCO: revisar/licenciar antes de clientes pagantes.'
 where feed_url = 'https://feeds.bbci.co.uk/portuguese/rss.xml';
update public.news_sources set content_mode = 'summary',
       terms_notes = 'INATIVA: o feed redireciona para admin.cnnbrasil.com.br, cujo robots.txt bloqueia tudo (Disallow: /). Substituída pelo mapa de notícias, liberado no robots.txt.'
 where feed_url = 'https://www.cnnbrasil.com.br/feed/';

with g as (select id, name from public.news_source_groups)
insert into public.news_sources
  (name, website, feed_url, source_type, scope, state, country, language, default_category, group_id,
   reliability_level, is_primary, allowed_hosts, is_active, content_mode, terms_notes)
select v.name, v.website, v.feed_url, v.source_type, v.scope, v.state, v.country, v.language, v.category,
       (select id from g where g.name = v.grp), v.reliability, v.is_primary, v.hosts, v.active, v.mode, v.notes
from (values
  -- ---------------- Nacionais (ativos, modo resumo) ----------------
  ('G1 — Política', 'https://g1.globo.com', 'https://g1.globo.com/rss/g1/politica/', 'rss', 'nacional', null, 'BR', 'pt', 'politica_nacional', 'Grupo Globo', 4, false, array['g1.globo.com'], true, 'summary', 'Ver G1 — Últimas.'),
  ('G1 — Economia', 'https://g1.globo.com', 'https://g1.globo.com/rss/g1/economia/', 'rss', 'nacional', null, 'BR', 'pt', 'economia', 'Grupo Globo', 4, false, array['g1.globo.com'], true, 'summary', 'Ver G1 — Últimas.'),
  ('G1 — Educação', 'https://g1.globo.com', 'https://g1.globo.com/rss/g1/educacao/', 'rss', 'nacional', null, 'BR', 'pt', 'educacao', 'Grupo Globo', 4, false, array['g1.globo.com'], true, 'summary', 'Ver G1 — Últimas.'),
  ('O Globo', 'https://oglobo.globo.com', 'https://oglobo.globo.com/rss/oglobo', 'rss', 'nacional', null, 'BR', 'pt', null, 'Grupo Globo', 4, false, array['oglobo.globo.com'], true, 'summary', 'Ver G1 — Últimas (mesmo grupo).'),
  ('Valor Econômico', 'https://valor.globo.com', 'https://valor.globo.com/rss/valor', 'rss', 'nacional', null, 'BR', 'pt', 'economia', 'Grupo Globo', 4, false, array['valor.globo.com'], true, 'summary', 'Ver G1 — Últimas (mesmo grupo).'),
  ('UOL — Notícias', 'https://noticias.uol.com.br', 'https://rss.uol.com.br/feed/noticias.xml', 'rss', 'nacional', null, 'BR', 'pt', null, 'Grupo Folha (Folha e UOL)', 4, false, array['rss.uol.com.br'], true, 'summary', 'ATIVA (modo resumo): feed sem robots.txt (permitido). Termos NÃO VERIFICADOS: a página de termos recusa acesso automatizado (HTTP 403). Revisar antes de clientes pagantes.'),
  ('UOL — Economia', 'https://economia.uol.com.br', 'https://rss.uol.com.br/feed/economia.xml', 'rss', 'nacional', null, 'BR', 'pt', 'economia', 'Grupo Folha (Folha e UOL)', 4, false, array['rss.uol.com.br'], true, 'summary', 'Ver UOL — Notícias.'),
  ('Folha — Em cima da hora', 'https://www.folha.uol.com.br', 'https://feeds.folha.uol.com.br/emcimadahora/rss091.xml', 'rss', 'nacional', null, 'BR', 'pt', null, 'Grupo Folha (Folha e UOL)', 4, false, array['feeds.folha.uol.com.br'], true, 'summary', 'ATIVA (modo resumo): robots.txt permite. Termos NÃO VERIFICADOS (página de termos não localizada). Revisar antes de clientes pagantes.'),
  ('Folha — Poder', 'https://www.folha.uol.com.br', 'https://feeds.folha.uol.com.br/poder/rss091.xml', 'rss', 'nacional', null, 'BR', 'pt', 'politica_nacional', 'Grupo Folha (Folha e UOL)', 4, false, array['feeds.folha.uol.com.br'], true, 'summary', 'Ver Folha — Em cima da hora.'),
  ('Folha — Mercado', 'https://www.folha.uol.com.br', 'https://feeds.folha.uol.com.br/mercado/rss091.xml', 'rss', 'nacional', null, 'BR', 'pt', 'economia', 'Grupo Folha (Folha e UOL)', 4, false, array['feeds.folha.uol.com.br'], true, 'summary', 'Ver Folha — Em cima da hora.'),
  ('CNN Brasil — Mapa de notícias', 'https://www.cnnbrasil.com.br', 'https://admin.cnnbrasil.com.br/sitemap-news.xml', 'sitemap', 'nacional', null, 'BR', 'pt', null, 'CNN Brasil', 4, false, array['admin.cnnbrasil.com.br'], true, 'summary', 'ATIVA (só títulos): o robots.txt de admin.cnnbrasil.com.br bloqueia tudo exceto /sitemap-news.xml, feito para agregadores. Termos proíbem reproduzir conteúdo (não reproduzimos; texto próprio com crédito).'),
  ('Poder360', 'https://www.poder360.com.br', 'https://www.poder360.com.br/feed/', 'rss', 'nacional', null, 'BR', 'pt', 'politica_nacional', 'Poder360', 4, false, array['www.poder360.com.br'], true, 'summary', 'ATIVA (modo resumo): robots.txt permite; termos sem cláusula sobre robôs; reprodução de textos exige autorização (não reproduzimos).'),
  ('Veja', 'https://veja.abril.com.br', 'https://veja.abril.com.br/feed/', 'rss', 'nacional', null, 'BR', 'pt', null, 'Grupo Abril', 3, false, array['veja.abril.com.br'], true, 'summary', 'ATIVA (modo resumo): robots.txt permite; termos da Abril sem cláusula sobre robôs; vedam exploração do conteúdo (não reproduzimos).'),
  ('Jovem Pan', 'https://jovempan.com.br', 'https://jovempan.com.br/feed', 'rss', 'nacional', null, 'BR', 'pt', null, 'Jovem Pan', 3, false, array['jovempan.com.br'], true, 'summary', 'ATIVA (modo resumo): robots.txt permite. Termos NÃO VERIFICADOS (página não localizada).'),
  ('CartaCapital', 'https://www.cartacapital.com.br', 'https://www.cartacapital.com.br/feed/', 'rss', 'nacional', null, 'BR', 'pt', null, 'CartaCapital', 3, false, array['www.cartacapital.com.br'], true, 'summary', 'ATIVA (modo resumo): robots.txt permite; política proíbe reprodução sem autorização (não reproduzimos), sem cláusula sobre robôs.'),
  ('InfoMoney', 'https://www.infomoney.com.br', 'https://www.infomoney.com.br/feed/', 'rss', 'nacional', null, 'BR', 'pt', 'economia', 'InfoMoney', 3, false, array['www.infomoney.com.br'], true, 'summary', 'ATIVA (modo resumo): robots.txt permite. Termos NÃO VERIFICADOS (só a política de privacidade foi localizada).'),
  ('Conjur — Consultor Jurídico', 'https://www.conjur.com.br', 'https://www.conjur.com.br/rss.xml', 'rss', 'nacional', null, 'BR', 'pt', 'legislacao', 'Conjur', 4, false, array['www.conjur.com.br', 'conjur.com.br'], true, 'summary', 'ATIVA (modo resumo): robots.txt permite; página de termos sem cláusula sobre robôs.'),
  ('Agência Gov', 'https://agenciagov.ebc.com.br', 'https://agenciagov.ebc.com.br/rss.xml', 'rss', 'nacional', null, 'BR', 'pt', 'administracao_publica', 'Governo Federal', 5, true, array['agenciagov.ebc.com.br'], true, 'full', 'ATIVA: agência de notícias do Governo Federal (EBC); termos: "reprodução autorizada mediante indicação da fonte".'),
  -- ---------------- Ceará ----------------
  ('G1 — Ceará', 'https://g1.globo.com/ce/ceara/', 'https://g1.globo.com/rss/g1/ce/ceara/', 'rss', 'estadual', 'CE', 'BR', 'pt', 'acontecimentos_regionais', 'Grupo Globo', 4, false, array['g1.globo.com'], true, 'summary', 'Ver G1 — Últimas.'),
  ('O Povo', 'https://www.opovo.com.br', 'https://www.opovo.com.br/noticias/rss.xml', 'rss', 'estadual', 'CE', 'BR', 'pt', 'acontecimentos_regionais', 'Grupo O Povo', 4, false, array['www.opovo.com.br'], true, 'summary', 'ATIVA (modo resumo; o feed traz só títulos): robots.txt permite. Termos NÃO VERIFICADOS.'),
  ('CN7', 'https://cn7.com.br', 'https://www.cn7.com.br/feed/', 'rss', 'estadual', 'CE', 'BR', 'pt', 'acontecimentos_regionais', 'CN7', 3, false, array['www.cn7.com.br', 'cn7.com.br'], true, 'summary', 'ATIVA (modo resumo): robots.txt permite. Termos NÃO VERIFICADOS.'),
  -- ---------------- Internacionais ----------------
  ('G1 — Mundo', 'https://g1.globo.com/mundo/', 'https://g1.globo.com/rss/g1/mundo/', 'rss', 'internacional', null, 'BR', 'pt', 'relacoes_internacionais', 'Grupo Globo', 4, false, array['g1.globo.com'], true, 'summary', 'Ver G1 — Últimas.'),
  ('Folha — Mundo', 'https://www.folha.uol.com.br/mundo/', 'https://feeds.folha.uol.com.br/mundo/rss091.xml', 'rss', 'internacional', null, 'BR', 'pt', 'relacoes_internacionais', 'Grupo Folha (Folha e UOL)', 4, false, array['feeds.folha.uol.com.br'], true, 'summary', 'Ver Folha — Em cima da hora.'),
  ('BBC World', 'https://www.bbc.com/news/world', 'https://feeds.bbci.co.uk/news/world/rss.xml', 'rss', 'internacional', null, 'GB', 'en', 'relacoes_internacionais', 'BBC', 4, false, array['feeds.bbci.co.uk'], true, 'summary', 'Ver BBC News Brasil (mesmo grupo; RISCO: uso pessoal/não comercial).'),
  ('DW Brasil', 'https://www.dw.com/pt-br/', 'https://rss.dw.com/xml/rss-br-all', 'rss', 'internacional', null, 'DE', 'pt', 'relacoes_internacionais', 'Deutsche Welle', 4, false, array['rss.dw.com'], true, 'summary', 'ATIVA (modo resumo): robots.txt permite; termos sem cláusula sobre robôs, mas proíbem uso comercial do conteúdo — RISCO: revisar/licenciar antes de clientes pagantes.'),
  ('El País — Internacional', 'https://elpais.com/internacional/', 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/internacional/portada', 'rss', 'internacional', null, 'ES', 'es', 'relacoes_internacionais', 'PRISA (El País)', 4, false, array['feeds.elpais.com'], true, 'summary', 'ATIVA (modo resumo): feed sem robots.txt (permitido); aviso legal sem cláusula sobre robôs.'),
  ('Euronews (português)', 'https://pt.euronews.com', 'https://pt.euronews.com/rss', 'rss', 'internacional', null, 'FR', 'pt', 'relacoes_internacionais', 'Euronews', 3, false, array['pt.euronews.com'], true, 'summary', 'ATIVA (modo resumo): robots.txt permite; termos sem cláusula sobre robôs, mas restringem a uso pessoal/não comercial — RISCO: revisar antes de clientes pagantes.'),
  ('NPR — World', 'https://www.npr.org/sections/world/', 'https://feeds.npr.org/1004/rss.xml', 'rss', 'internacional', null, 'US', 'en', 'relacoes_internacionais', 'NPR', 4, false, array['feeds.npr.org'], true, 'summary', 'ATIVA (modo resumo): feed sem robots.txt (permitido). Termos NÃO VERIFICADOS (site não respondeu).'),
  -- ---------------- Inativos (termos proíbem robôs) ----------------
  ('Estadão — Política', 'https://www.estadao.com.br', 'https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/politica/', 'rss', 'nacional', null, 'BR', 'pt', 'politica_nacional', 'Estadão', 4, false, array['www.estadao.com.br'], false, 'summary', 'INATIVA: termos de uso vedam "mineração ou raspagem de dados, seja através de robôs, web spiders ou scripts".'),
  ('Exame', 'https://exame.com', 'https://exame.com/feed/', 'rss', 'nacional', null, 'BR', 'pt', 'economia', 'Exame', 4, false, array['exame.com'], false, 'summary', 'INATIVA: termos de uso vedam "fazer scrapping" sem consentimento.'),
  ('Gazeta do Povo', 'https://www.gazetadopovo.com.br', 'https://www.gazetadopovo.com.br/feed/rss/ultimas-noticias.xml', 'rss', 'nacional', null, 'BR', 'pt', null, 'Gazeta do Povo', 3, false, array['www.gazetadopovo.com.br'], false, 'summary', 'INATIVA: termos: "É proibido uso de robôs, spiders ou mineração de dados automatizada".'),
  ('Metrópoles', 'https://www.metropoles.com', 'https://www.metropoles.com/feed', 'rss', 'nacional', null, 'BR', 'pt', null, 'Metrópoles', 3, false, array['www.metropoles.com'], false, 'summary', 'INATIVA: termos vedam "utilizar robôs, raspadores ou quaisquer meios automatizados sem autorização prévia".'),
  ('JOTA', 'https://www.jota.info', 'https://www.jota.info/feed', 'rss', 'nacional', null, 'BR', 'pt', 'legislacao', 'JOTA', 4, false, array['www.jota.info'], false, 'summary', 'INATIVA: termos vedam "usar robôs, spiders ou qualquer outro dispositivo, automático ou manual, para monitorar ou copiar".'),
  ('RFI Brasil', 'https://www.rfi.fr/br/', 'https://www.rfi.fr/br/rss', 'rss', 'internacional', null, 'FR', 'pt', 'relacoes_internacionais', 'France Médias Monde (RFI, France 24)', 4, false, array['www.rfi.fr'], false, 'summary', 'INATIVA: aviso legal da France Médias Monde veda extrair conteúdos "por qualquer meio... automática ou manualmente".'),
  ('France 24', 'https://www.france24.com/en/', 'https://www.france24.com/en/rss', 'rss', 'internacional', null, 'FR', 'en', 'relacoes_internacionais', 'France Médias Monde (RFI, France 24)', 4, false, array['www.france24.com'], false, 'summary', 'INATIVA: mesmo grupo da RFI (France Médias Monde) — termos vedam extração automática.'),
  ('The Guardian — World', 'https://www.theguardian.com/world', 'https://www.theguardian.com/world/rss', 'rss', 'internacional', null, 'GB', 'en', 'relacoes_internacionais', 'The Guardian', 4, false, array['www.theguardian.com'], false, 'summary', 'INATIVA: termos vedam "use, copy, scrape, reproduce... collect, mine and/or extract" sem aprovação.'),
  ('The New York Times — World', 'https://www.nytimes.com/section/world', 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', 'rss', 'internacional', null, 'US', 'en', 'relacoes_internacionais', 'The New York Times', 4, false, array['rss.nytimes.com'], false, 'summary', 'INATIVA: termos vedam "use robots, spiders, scripts..." e limitam os feeds RSS a uso pessoal/não comercial.'),
  ('Al Jazeera', 'https://www.aljazeera.com', 'https://www.aljazeera.com/xml/rss/all.xml', 'rss', 'internacional', null, 'QA', 'en', 'relacoes_internacionais', 'Al Jazeera', 4, false, array['www.aljazeera.com'], false, 'summary', 'INATIVA: termos vedam "text or data mining, or web scraping... spider, scraper, bot".'),
  -- ---------------- Inativos (feed parado) ----------------
  ('GloboNews', 'https://g1.globo.com/globonews/', 'https://g1.globo.com/rss/g1/globonews/', 'rss', 'nacional', null, 'BR', 'pt', null, 'Grupo Globo', 4, false, array['g1.globo.com'], false, 'summary', 'INATIVA: feed parado (último item ~9 dias); o conteúdo da GloboNews é publicado nos feeds do G1 já ativos.'),
  ('CNN — World', 'https://edition.cnn.com/world', 'https://rss.cnn.com/rss/edition_world.rss', 'rss', 'internacional', null, 'US', 'en', 'relacoes_internacionais', 'CNN (internacional)', 4, false, array['rss.cnn.com'], false, 'summary', 'INATIVA: feed parado desde 2023 (a CNN descontinuou os feeds RSS).'),
  ('Correio Braziliense', 'https://www.correiobraziliense.com.br', 'https://www.correiobraziliense.com.br/feed/', 'rss', 'nacional', null, 'BR', 'pt', null, 'Correio Braziliense', 3, false, array['www.correiobraziliense.com.br'], false, 'summary', 'INATIVA: feed parado (último item de 2023).')
) as v(name, website, feed_url, source_type, scope, state, country, language, category, grp, reliability, is_primary, hosts, active, mode, notes)
where not exists (select 1 from public.news_sources s where s.feed_url = v.feed_url);
