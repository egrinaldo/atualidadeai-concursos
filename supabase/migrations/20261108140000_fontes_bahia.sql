-- =====================================================================
-- Migração 27 — Fontes estaduais da Bahia (08/11/2026) e BA em pipeline.pilot_states.
-- Mesmas regras da migração 17: só feed RSS; robots.txt respeitado; modo resumo para veículos de imprensa;
-- veículo cujos termos proíbem robôs fica inativo. Só acrescenta; idempotente.
-- Verificação de 08/11/2026: feed, robots.txt (com o agente do robô) e frequência de publicação.
-- Sem feed público (ficam de fora por ora): Governo da Bahia (ba.gov.br), Assembleia (al.ba.gov.br), TCE-BA.
-- =====================================================================

insert into public.news_source_groups (name, notes) values
  ('Grupo A Tarde', null), ('Bahia Notícias', null), ('Metro1', null),
  ('TJBA', 'Tribunal de Justiça da Bahia'), ('MPBA', 'Ministério Público da Bahia'),
  ('TCM-BA', 'Tribunal de Contas dos Municípios da Bahia'), ('Prefeitura de Salvador', null)
on conflict (name) do nothing;

with g as (select id, name from public.news_source_groups)
insert into public.news_sources
  (name, website, feed_url, source_type, scope, state, country, language, default_category, group_id,
   reliability_level, is_primary, allowed_hosts, is_active, content_mode, terms_notes)
select v.name, v.website, v.feed_url, 'rss', 'estadual', 'BA', 'BR', 'pt', v.category,
       (select id from g where g.name = v.grp), v.reliability, v.is_primary, v.hosts, v.active, v.mode, v.notes
from (values
  -- Órgãos públicos (texto integral do feed)
  ('TJBA — Notícias', 'https://www.tjba.jus.br', 'https://www.tjba.jus.br/portal/feed/', 'legislacao', 'TJBA', 5, true, array['www.tjba.jus.br'], true, 'full',
   'Órgão público; sem robots.txt (404 = permitido). Feed ativo (3 itens em 24h em 08/11/2026).'),
  ('MPBA — Notícias', 'https://www.mpba.mp.br', 'https://www.mpba.mp.br/rss.xml', 'acontecimentos_regionais', 'MPBA', 5, true, array['www.mpba.mp.br'], true, 'full',
   'Órgão público; robots.txt permite.'),
  ('TCM-BA — Notícias', 'https://www.tcm.ba.gov.br', 'https://www.tcm.ba.gov.br/feed/', 'administracao_publica', 'TCM-BA', 5, true, array['www.tcm.ba.gov.br'], true, 'full',
   'Órgão público; robots.txt permite.'),
  ('Prefeitura de Salvador', 'https://salvador.ba.gov.br', 'https://www.salvador.ba.gov.br/feed/', 'acontecimentos_regionais', 'Prefeitura de Salvador', 5, true, array['www.salvador.ba.gov.br', 'salvador.ba.gov.br'], false, 'full',
   'INATIVA: feed parado (último item 23/10/2026 na verificação de 08/11/2026). Reativar se voltar a publicar.'),
  -- Imprensa (modo resumo: só título + resumo curto; texto próprio com crédito e link)
  ('G1 — Bahia', 'https://g1.globo.com/ba/bahia/', 'https://g1.globo.com/rss/g1/ba/bahia/', 'acontecimentos_regionais', 'Grupo Globo', 4, false, array['g1.globo.com'], true, 'summary',
   'Ver G1 — Últimas. (O feed antigo /rss/g1/bahia/ está parado desde 2018.)'),
  ('A Tarde', 'https://atarde.com.br', 'https://atarde.com.br/rss', 'acontecimentos_regionais', 'Grupo A Tarde', 4, false, array['atarde.com.br'], true, 'summary',
   'ATIVA (modo resumo): robots.txt permite. Termos NÃO VERIFICADOS (página de termos não localizada em 08/11/2026).'),
  ('Bahia Notícias', 'https://www.bahianoticias.com.br', 'https://www.bahianoticias.com.br/rss.xml', 'acontecimentos_regionais', 'Bahia Notícias', 3, false, array['www.bahianoticias.com.br'], true, 'summary',
   'ATIVA (modo resumo): robots.txt permite. Termos NÃO VERIFICADOS (página de termos não localizada em 08/11/2026).'),
  ('Metro1', 'https://www.metro1.com.br', 'https://www.metro1.com.br/rss', 'acontecimentos_regionais', 'Metro1', 3, false, array['www.metro1.com.br'], true, 'summary',
   'ATIVA (modo resumo): robots.txt permite. Termos NÃO VERIFICADOS (página de termos não localizada em 08/11/2026).')
) as v(name, website, feed_url, category, grp, reliability, is_primary, hosts, active, mode, notes)
where not exists (select 1 from public.news_sources s where s.feed_url = v.feed_url);

-- Bahia passa a ter bloco estadual (análise e edição)
update public.app_settings
   set value = (select jsonb_agg(distinct x order by x) from jsonb_array_elements_text(value || '["BA"]'::jsonb) as t(x)), updated_at = now()
 where key = 'pipeline.pilot_states' and not (value ? 'BA');
