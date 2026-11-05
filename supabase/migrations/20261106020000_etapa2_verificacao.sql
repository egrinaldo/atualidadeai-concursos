-- =====================================================================
-- Migração 15 — Etapa 2.4: verificação das informações
-- Apenas acrescenta colunas/índices/configurações; não altera nem apaga dados existentes.
-- Idempotente (pode ser aplicada mais de uma vez).
-- =====================================================================

-- Resumo da verificação mais recente no próprio assunto (filtro rápido para edição e painel).
-- O histórico completo continua em news_verifications.
alter table public.news_clusters add column if not exists verification_status text
  check (verification_status in ('corroborada', 'parcialmente_corroborada', 'nao_confirmada',
                                 'fontes_divergentes', 'contradita', 'insuficiente'));
alter table public.news_clusters add column if not exists verification_confidence text
  check (verification_confidence in ('alta', 'media', 'baixa'));
alter table public.news_clusters add column if not exists needs_review boolean not null default false;
alter table public.news_clusters add column if not exists verified_at timestamptz;
-- Marca de quando o assunto ganhou/perdeu matérias (o gatilho de updated_at muda a cada gravação,
-- então não serve para saber se a verificação está desatualizada)
alter table public.news_clusters add column if not exists members_changed_at timestamptz not null default now();

-- Assuntos já existentes: a marca é a última matéria vista
update public.news_clusters set members_changed_at = last_seen_at
 where verified_at is null and members_changed_at > last_seen_at;

create index if not exists news_clusters_verify_queue_idx on public.news_clusters (status, members_changed_at)
  where status in ('open', 'verified');
create index if not exists news_clusters_review_idx on public.news_clusters (needs_review, last_seen_at desc) where needs_review;

-- Política editorial (o painel da Subetapa 2.7 passa a editá-la)
insert into public.app_settings (key, value) values
  ('verification.edition_statuses', '["corroborada", "parcialmente_corroborada", "nao_confirmada"]'),
  ('verification.single_source_min_reliability', '4')
on conflict (key) do nothing;
