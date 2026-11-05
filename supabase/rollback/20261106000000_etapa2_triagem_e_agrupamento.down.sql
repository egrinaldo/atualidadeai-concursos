-- Reversão da migração 14 (Etapa 2.3). Remove apenas o que ela acrescentou.
-- Atenção: as pontuações e motivos da triagem são perdidos (podem ser recalculados reprocessando a triagem).
begin;
delete from public.app_settings where key in ('triage.min_relevance_for_edition', 'triage.cluster_window_hours', 'triage.similarity_threshold');
drop index if exists public.news_clusters_relevance_idx;
alter table public.news_clusters drop column if exists source_count;
alter table public.news_clusters drop column if exists relevance_score;
drop index if exists public.news_triage_queue_idx;
alter table public.news drop column if exists triaged_at;
alter table public.news drop column if exists triage_reasons;
alter table public.news drop column if exists relevance_score;
update public.news_sources set language = 'pt' where feed_url = 'https://ec.europa.eu/commission/presscorner/api/rss?lang=pt';
commit;
