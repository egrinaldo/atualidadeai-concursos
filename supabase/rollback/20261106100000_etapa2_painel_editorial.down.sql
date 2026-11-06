-- Reversão da migração 19 (Etapa 2.7). ATENÇÃO: falha se já houver registros com os novos tipos/ações
-- (preserve-os ou apague conscientemente antes de reverter).
begin;
drop index if exists public.news_clusters_needs_review_idx;
drop index if exists public.editorial_reviews_reviewer_idx;
alter table public.editorial_reviews drop constraint if exists editorial_reviews_action_check;
alter table public.editorial_reviews add constraint editorial_reviews_action_check
  check (action in ('approve', 'reject', 'edit', 'request_reanalysis', 'publish', 'unpublish', 'regenerate'));
alter table public.editorial_reviews drop constraint if exists editorial_reviews_target_type_check;
alter table public.editorial_reviews add constraint editorial_reviews_target_type_check
  check (target_type in ('cluster', 'analysis', 'edition', 'document', 'source'));
commit;
