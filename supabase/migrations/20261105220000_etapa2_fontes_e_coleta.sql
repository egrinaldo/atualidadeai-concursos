-- =====================================================================
-- AtualidadeAI Concursos — Migração 13 (Etapa 2.2): histórico de coleta
-- e cadastro inicial das fontes (verificadas em 05/11/2026).
-- ---------------------------------------------------------------------
-- Somente adições. Script reexecutável (não sobrescreve fontes editadas
-- depois pelo painel: insere apenas as que ainda não existem).
-- =====================================================================

alter table public.news_sources add column if not exists language text not null default 'pt'
  check (language in ('pt', 'en', 'es', 'fr'));

-- Histórico de cada tentativa de coleta (painel: "última coleta", erros)
create table if not exists public.source_fetch_logs (
  id                 bigint generated always as identity primary key,
  source_id          uuid not null references public.news_sources (id) on delete cascade,
  job_id             uuid references public.processing_jobs (id) on delete set null,
  status             text not null check (status in ('ok', 'not_modified', 'blocked', 'error')),
  http_status        int,
  items_found        int not null default 0,
  items_inserted     int not null default 0,
  duplicates_content int not null default 0,
  error              text check (char_length(error) <= 1000),
  duration_ms        int,
  created_at         timestamptz not null default now()
);
create index if not exists source_fetch_logs_source_idx on public.source_fetch_logs (source_id, created_at desc);
alter table public.source_fetch_logs enable row level security;
revoke all on table public.source_fetch_logs from anon, authenticated;
grant select, insert, delete on table public.source_fetch_logs to service_role;
grant usage, select on sequence public.source_fetch_logs_id_seq to service_role;

-- ---------------------------------------------------------------------
-- Grupos editoriais (fontes do mesmo grupo não contam como independentes)
-- ---------------------------------------------------------------------
insert into public.news_source_groups (name, notes) values
  ('EBC — Empresa Brasil de Comunicação', 'Agência Brasil'),
  ('Senado Federal', null), ('Câmara dos Deputados', null), ('Supremo Tribunal Federal', null),
  ('Tribunal de Contas da União', null), ('IBGE', null), ('Banco Central do Brasil', null),
  ('Organização das Nações Unidas', 'Inclui OMS (agência especializada)'), ('União Europeia', null),
  ('Organização Mundial do Comércio', null), ('Prefeitura de Fortaleza', null), ('TCE-CE', null),
  ('Ministério Público do Ceará', null), ('Tribunal de Justiça do Ceará', null), ('Governo do Ceará', null),
  ('Governo Federal', null), ('Grupo Globo', 'G1'), ('BBC', null), ('CNN Brasil', null)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- Fontes. Ativas: órgãos públicos e agência pública com feed funcional e
-- coleta permitida pelo robots.txt. Inativas: motivo em terms_notes.
-- ---------------------------------------------------------------------
with g as (select id, name from public.news_source_groups)
insert into public.news_sources
  (name, website, feed_url, source_type, api_kind, scope, state, country, language, default_category, group_id,
   reliability_level, is_primary, allowed_hosts, is_active, terms_notes)
select v.name, v.website, v.feed_url, v.source_type, v.api_kind, v.scope, v.state, v.country, v.language, v.category,
       (select id from g where g.name = v.grp), v.reliability, v.is_primary, v.hosts, v.active, v.notes
from (values
  -- Nacionais
  ('Agência Brasil — Últimas', 'https://agenciabrasil.ebc.com.br', 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml', 'rss', null, 'nacional', null, 'BR', 'pt', null, 'EBC — Empresa Brasil de Comunicação', 4, false, array['agenciabrasil.ebc.com.br'], true,
   'robots.txt permite (crawl-delay 10). Política: reprodução para fins jornalísticos com crédito; uso comercial requer contato com o licenciamento da EBC. Usamos só título, link e resumo próprio com crédito.'),
  ('Agência Brasil — Economia', 'https://agenciabrasil.ebc.com.br', 'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml', 'rss', null, 'nacional', null, 'BR', 'pt', 'economia', 'EBC — Empresa Brasil de Comunicação', 4, false, array['agenciabrasil.ebc.com.br'], true, 'Ver Agência Brasil — Últimas.'),
  ('Agência Senado', 'https://www12.senado.leg.br/noticias', 'https://www12.senado.leg.br/noticias/rss', 'rss', null, 'nacional', null, 'BR', 'pt', 'legislacao', 'Senado Federal', 5, true, array['www12.senado.leg.br'], true, 'Órgão público; robots.txt permite.'),
  ('Câmara dos Deputados — Notícias', 'https://www.camara.leg.br/noticias', 'https://www.camara.leg.br/noticias/rss/ultimas-noticias', 'rss', null, 'nacional', null, 'BR', 'pt', 'legislacao', 'Câmara dos Deputados', 5, true, array['www.camara.leg.br'], true, 'Órgão público; robots.txt permite (crawl-delay 10).'),
  ('STF — Notícias', 'https://noticias.stf.jus.br', 'https://noticias.stf.jus.br/feed/', 'rss', null, 'nacional', null, 'BR', 'pt', 'legislacao', 'Supremo Tribunal Federal', 5, true, array['noticias.stf.jus.br'], true, 'Órgão público; robots.txt permite. Em 05/11/2026 o item mais recente era de 05/10/2026 — acompanhar.'),
  ('TCU — Notícias', 'https://portal.tcu.gov.br', 'https://portal.tcu.gov.br/rss.xml', 'rss', null, 'nacional', null, 'BR', 'pt', 'administracao_publica', 'Tribunal de Contas da União', 5, true, array['portal.tcu.gov.br'], true, 'Órgão público; robots.txt permite.'),
  ('IBGE — Agência de Notícias', 'https://agenciadenoticias.ibge.gov.br', 'https://servicodados.ibge.gov.br/api/v3/noticias/?qtd=30', 'api', 'ibge', 'nacional', null, 'BR', 'pt', 'economia', 'IBGE', 5, true, array['servicodados.ibge.gov.br'], true, 'API pública documentada do IBGE.'),
  ('Banco Central — Notícias', 'https://www.bcb.gov.br', 'https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/noticias', 'rss', null, 'nacional', null, 'BR', 'pt', 'economia', 'Banco Central do Brasil', 5, true, array['www.bcb.gov.br'], true, 'Órgão público; robots.txt permite.'),
  ('Banco Central — Notas à imprensa', 'https://www.bcb.gov.br', 'https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/notasImprensa', 'rss', null, 'nacional', null, 'BR', 'pt', 'economia', 'Banco Central do Brasil', 5, true, array['www.bcb.gov.br'], true, 'Órgão público; robots.txt permite.'),
  -- Internacionais
  ('Agência Brasil — Internacional', 'https://agenciabrasil.ebc.com.br', 'https://agenciabrasil.ebc.com.br/rss/internacional/feed.xml', 'rss', null, 'internacional', null, 'BR', 'pt', 'relacoes_internacionais', 'EBC — Empresa Brasil de Comunicação', 4, false, array['agenciabrasil.ebc.com.br'], true, 'Ver Agência Brasil — Últimas.'),
  ('ONU — Press releases', 'https://press.un.org', 'https://press.un.org/en/rss.xml', 'rss', null, 'internacional', null, 'US', 'en', 'politica_internacional', 'Organização das Nações Unidas', 5, true, array['press.un.org'], true, 'robots.txt permite o feed. Obs.: news.un.org (ONU News em português) bloqueia /news/ no robots.txt.'),
  ('OMS — Notícias', 'https://www.who.int', 'https://www.who.int/rss-feeds/news-english.xml', 'rss', null, 'internacional', null, 'CH', 'en', 'saude', 'Organização das Nações Unidas', 5, true, array['www.who.int'], true, 'robots.txt permite.'),
  ('União Europeia — Comissão (imprensa)', 'https://ec.europa.eu/commission/presscorner', 'https://ec.europa.eu/commission/presscorner/api/rss?lang=pt', 'rss', null, 'internacional', null, 'BE', 'pt', 'relacoes_internacionais', 'União Europeia', 5, true, array['ec.europa.eu'], true, 'robots.txt permite.'),
  ('OMC — Notícias', 'https://www.wto.org', 'https://www.wto.org/library/rss/latest_news_e.xml', 'rss', null, 'internacional', null, 'CH', 'en', 'economia', 'Organização Mundial do Comércio', 5, true, array['www.wto.org'], true, 'robots.txt permite.'),
  -- Ceará (piloto)
  ('Prefeitura de Fortaleza', 'https://www.fortaleza.ce.gov.br', 'https://www.fortaleza.ce.gov.br/noticias?format=feed&type=rss', 'rss', null, 'estadual', 'CE', 'BR', 'pt', 'acontecimentos_regionais', 'Prefeitura de Fortaleza', 5, true, array['www.fortaleza.ce.gov.br'], true, 'Órgão público; robots.txt permite.'),
  ('TCE-CE — Notícias', 'https://www.tce.ce.gov.br', 'https://www.tce.ce.gov.br/comunicacao/noticias?format=feed&type=rss', 'rss', null, 'estadual', 'CE', 'BR', 'pt', 'administracao_publica', 'TCE-CE', 5, true, array['www.tce.ce.gov.br'], true, 'Órgão público; robots.txt permite.'),
  ('MPCE — Notícias', 'https://mpce.mp.br', 'https://mpce.mp.br/feed/', 'rss', null, 'estadual', 'CE', 'BR', 'pt', 'acontecimentos_regionais', 'Ministério Público do Ceará', 5, true, array['mpce.mp.br'], true, 'Órgão público; robots.txt permite.'),
  ('TJCE — Notícias', 'https://www.tjce.jus.br', 'https://www.tjce.jus.br/feed/', 'rss', null, 'estadual', 'CE', 'BR', 'pt', 'legislacao', 'Tribunal de Justiça do Ceará', 5, true, array['www.tjce.jus.br'], true, 'Órgão público; robots.txt permite. Em 05/11/2026 o item mais recente era de 26/03/2026 — feed possivelmente desativado.'),
  -- Inativas (motivo registrado)
  ('Governo do Ceará', 'https://www.ceara.gov.br', 'https://www.ceara.gov.br/feed/', 'rss', null, 'estadual', 'CE', 'BR', 'pt', 'acontecimentos_regionais', 'Governo do Ceará', 5, true, array['www.ceara.gov.br'], false,
   'INATIVA: certificado HTTPS do site com cadeia incompleta (UNABLE_TO_VERIFY_LEAF_SIGNATURE). Não desativamos a verificação TLS; reativar quando o site corrigir ou com a AC intermediária oficial configurada.'),
  ('Planalto — Notícias', 'https://www.gov.br/planalto', 'https://www.gov.br/planalto/pt-br/acompanhe-o-planalto/noticias/RSS', 'rss', null, 'nacional', null, 'BR', 'pt', 'politica_nacional', 'Governo Federal', 5, true, array['www.gov.br'], false, 'INATIVA: feed desatualizado em 05/11/2026 (último item 27/09/2026).'),
  ('G1', 'https://g1.globo.com', 'https://g1.globo.com/rss/g1/', 'rss', null, 'nacional', null, 'BR', 'pt', null, 'Grupo Globo', 4, false, array['g1.globo.com'], false,
   'INATIVA: veículo comercial; uso do feed em produto pago exige autorização/licença. Decisão do responsável.'),
  ('BBC News Brasil', 'https://www.bbc.com/portuguese', 'https://feeds.bbci.co.uk/portuguese/rss.xml', 'rss', null, 'internacional', null, 'GB', 'pt', null, 'BBC', 4, false, array['feeds.bbci.co.uk'], false,
   'INATIVA: termos dos feeds da BBC limitam o uso a fins pessoais/não comerciais. Exige licença para produto pago.'),
  ('CNN Brasil', 'https://www.cnnbrasil.com.br', 'https://www.cnnbrasil.com.br/feed/', 'rss', null, 'nacional', null, 'BR', 'pt', null, 'CNN Brasil', 4, false, array['www.cnnbrasil.com.br', 'admin.cnnbrasil.com.br'], false,
   'INATIVA: robots.txt bloqueia todo o site (Disallow: /) e veículo comercial.'),
  ('ONU News (português)', 'https://news.un.org/pt', 'https://news.un.org/feed/subscribe/pt/news/all/rss.xml', 'rss', null, 'internacional', null, 'US', 'pt', 'politica_internacional', 'Organização das Nações Unidas', 5, true, array['news.un.org'], false,
   'INATIVA: robots.txt bloqueia caminhos com /news/ (inclui o feed).')
) as v(name, website, feed_url, source_type, api_kind, scope, state, country, language, category, grp, reliability, is_primary, hosts, active, notes)
where not exists (select 1 from public.news_sources s where s.feed_url = v.feed_url);

-- Retenção: inclui o histórico de coleta (90 dias)
create or replace function public.apply_retention()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.payment_events where received_at < now() - interval '12 months';
  delete from public.email_log      where created_at  < now() - interval '24 months';
  delete from public.leads l
   where l.created_at < now() - interval '24 months'
     and not exists (select 1 from public.profiles p where lower(p.email) = lower(l.email));
  delete from public.rate_limits    where window_start < now() - interval '2 days';
  delete from public.access_logs    where accessed_at  < now() - interval '6 months';
  update public.news set original_content = null
   where original_content is not null and collected_at < now() - interval '30 days';
  delete from public.news where status = 'discarded' and collected_at < now() - interval '30 days';
  delete from public.processing_jobs where status in ('succeeded', 'dead') and created_at < now() - interval '30 days';
  delete from public.ai_usage_logs where created_at < now() - interval '12 months';
  delete from public.source_fetch_logs where created_at < now() - interval '90 days';
end;
$$;
revoke all on function public.apply_retention() from public, anon, authenticated;
