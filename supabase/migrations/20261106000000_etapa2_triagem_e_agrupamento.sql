-- =====================================================================
-- Migração 14 — Etapa 2.3: triagem, classificação e agrupamento
-- Apenas acrescenta colunas/índices/configurações; não altera nem apaga dados existentes.
-- Idempotente (pode ser aplicada mais de uma vez).
-- =====================================================================

-- Notícias: pontuação explicável da triagem
alter table public.news add column if not exists relevance_score smallint check (relevance_score between 0 and 100);
alter table public.news add column if not exists triage_reasons  jsonb;        -- regras que pesaram na decisão
alter table public.news add column if not exists triaged_at      timestamptz;

create index if not exists news_triage_queue_idx on public.news (status, published_at) where status in ('collected', 'triaged');

-- Assuntos: pontuação e quantidade de fontes independentes (grupos editoriais distintos)
alter table public.news_clusters add column if not exists relevance_score smallint check (relevance_score between 0 and 100);
alter table public.news_clusters add column if not exists source_count    int not null default 0;

create index if not exists news_clusters_relevance_idx on public.news_clusters (scope, state, relevance_score desc, last_seen_at desc);

-- O feed "lang=pt" da Comissão Europeia publica em inglês (verificado em 05/11/2026)
update public.news_sources set language = 'en'
 where feed_url = 'https://ec.europa.eu/commission/presscorner/api/rss?lang=pt' and language <> 'en';

-- Parâmetros ajustáveis (o painel da Subetapa 2.7 passa a editá-los)
insert into public.app_settings (key, value) values
  ('triage.min_relevance_for_edition', '"media"'),
  ('triage.cluster_window_hours',      '72'),
  ('triage.similarity_threshold',      '0.38')
on conflict (key) do nothing;
