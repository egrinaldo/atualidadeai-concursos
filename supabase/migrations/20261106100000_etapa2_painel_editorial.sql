-- =====================================================================
-- Migração 19 — Etapa 2.7: painel editorial
-- Amplia os registros de decisão editorial; não altera nem apaga dados. Idempotente.
-- =====================================================================

-- Novos tipos de alvo e de ação no histórico de decisões
alter table public.editorial_reviews drop constraint if exists editorial_reviews_target_type_check;
alter table public.editorial_reviews add constraint editorial_reviews_target_type_check
  check (target_type in ('cluster', 'analysis', 'edition', 'document', 'source', 'setting'));

alter table public.editorial_reviews drop constraint if exists editorial_reviews_action_check;
alter table public.editorial_reviews add constraint editorial_reviews_action_check
  check (action in ('approve', 'reject', 'edit', 'request_reanalysis', 'publish', 'unpublish', 'regenerate',
                    'hold', 'add_item', 'remove_item', 'move_item', 'create', 'update'));

create index if not exists editorial_reviews_reviewer_idx on public.editorial_reviews (reviewer_id, created_at desc);
create index if not exists news_clusters_needs_review_idx on public.news_clusters (last_seen_at desc) where needs_review;

