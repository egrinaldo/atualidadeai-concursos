-- Reversão da migração 17: desativa os veículos de imprensa (as notícias já coletadas são preservadas;
-- apagar fontes com notícias violaria a chave estrangeira) e remove o tipo 'sitemap' e content_mode.
begin;
update public.news_sources set is_active = false where content_mode = 'summary';
update public.news_sources set is_active = false where source_type = 'sitemap';
alter table public.news_sources drop constraint if exists news_sources_source_type_check;
update public.news_sources set source_type = 'rss' where source_type = 'sitemap';
alter table public.news_sources add constraint news_sources_source_type_check check (source_type in ('rss', 'atom', 'api', 'html'));
alter table public.news_sources drop column if exists content_mode;
commit;
