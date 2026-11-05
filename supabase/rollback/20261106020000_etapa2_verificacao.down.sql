-- Reversão da migração 15 (Etapa 2.4). Remove apenas o que ela acrescentou.
-- O histórico em news_verifications é preservado.
begin;
delete from public.app_settings where key in ('verification.edition_statuses', 'verification.single_source_min_reliability');
drop index if exists public.news_clusters_review_idx;
drop index if exists public.news_clusters_verify_queue_idx;
alter table public.news_clusters drop column if exists members_changed_at;
alter table public.news_clusters drop column if exists verified_at;
alter table public.news_clusters drop column if exists needs_review;
alter table public.news_clusters drop column if exists verification_confidence;
alter table public.news_clusters drop column if exists verification_status;
commit;
