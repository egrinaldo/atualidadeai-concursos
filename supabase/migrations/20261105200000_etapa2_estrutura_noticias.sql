-- =====================================================================
-- AtualidadeAI Concursos — Migração 12 (Etapa 2.1): estrutura de notícias,
-- verificação, análise por IA, edições, PDFs, entregas e fila de tarefas.
-- ---------------------------------------------------------------------
-- Somente ADICIONA objetos. Nenhuma tabela da Etapa 1 é alterada.
-- Reversão: supabase/rollback/20261105200000_etapa2_estrutura_noticias.down.sql
-- Script reexecutável.
--
-- Acesso:
-- - Todas as tabelas com RLS. Escrita só pelo backend (service_role):
--   worker (GitHub Actions) e Edge Functions administrativas.
-- - Assinante: lê apenas as PRÓPRIAS entregas (document_deliveries).
--   Os PDFs são baixados por link temporário gerado no servidor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Categorias editoriais
-- ---------------------------------------------------------------------
create table if not exists public.news_categories (
  code        text primary key check (code ~ '^[a-z_]{2,40}$'),
  name        text not null check (char_length(name) between 2 and 60),
  description text not null default '' check (char_length(description) <= 300),
  sort_order  smallint not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.news_categories (code, name, sort_order) values
  ('politica_nacional',       'Política nacional',          10),
  ('politica_internacional',  'Política internacional',     20),
  ('economia',                'Economia',                   30),
  ('educacao',                'Educação',                   40),
  ('saude',                   'Saúde',                      50),
  ('seguranca_publica',       'Segurança pública',          60),
  ('meio_ambiente',           'Meio ambiente',              70),
  ('tecnologia',              'Tecnologia',                 80),
  ('ciencia',                 'Ciência',                    90),
  ('relacoes_internacionais', 'Relações internacionais',   100),
  ('direitos_humanos',        'Direitos humanos',          110),
  ('legislacao',              'Legislação',                120),
  ('administracao_publica',   'Administração pública',     130),
  ('sociedade',               'Sociedade',                 140),
  ('infraestrutura',          'Infraestrutura',            150),
  ('cultura',                 'Cultura',                   160),
  ('acontecimentos_regionais','Acontecimentos regionais',  170)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 2. Fontes e grupos editoriais (independência entre fontes)
-- ---------------------------------------------------------------------
create table if not exists public.news_source_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (char_length(name) between 2 and 120),
  notes      text check (char_length(notes) <= 500),
  created_at timestamptz not null default now()
);

create table if not exists public.news_sources (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null check (char_length(name) between 2 and 120),
  website                text not null check (website ~ '^https://'),
  feed_url               text unique check (feed_url is null or feed_url ~ '^https://'),
  source_type            text not null check (source_type in ('rss', 'atom', 'api', 'html')),
  api_kind               text check (char_length(api_kind) <= 40),
  scope                  text not null check (scope in ('internacional', 'nacional', 'estadual')),
  country                char(2) not null default 'BR' check (country ~ '^[A-Z]{2}$'),
  state                  char(2) check (state ~ '^[A-Z]{2}$'),
  default_category       text references public.news_categories (code) on update cascade on delete set null,
  group_id               uuid references public.news_source_groups (id) on delete set null,
  reliability_level      smallint not null default 3 check (reliability_level between 1 and 5),
  is_primary             boolean not null default false,  -- fonte oficial/primária (governo, tribunais, IBGE…)
  allowed_hosts          text[] not null default '{}',    -- hosts permitidos na coleta (proteção SSRF)
  fetch_interval_minutes int not null default 180 check (fetch_interval_minutes between 30 and 1440),
  is_active              boolean not null default true,
  last_checked_at        timestamptz,
  last_success_at        timestamptz,
  last_error             text check (char_length(last_error) <= 1000),
  consecutive_failures   int not null default 0,
  http_etag              text check (char_length(http_etag) <= 300),
  http_last_modified     text check (char_length(http_last_modified) <= 100),
  terms_notes            text check (char_length(terms_notes) <= 1000), -- robots.txt / termos de uso verificados
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (scope <> 'estadual' or state is not null)
);
create index if not exists news_sources_active_idx on public.news_sources (is_active, last_checked_at);

-- ---------------------------------------------------------------------
-- 3. Assuntos (agrupamento de matérias sobre o mesmo acontecimento)
-- ---------------------------------------------------------------------
create table if not exists public.news_clusters (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (char_length(title) <= 300),
  scope          text not null check (scope in ('internacional', 'nacional', 'estadual')),
  state          char(2) check (state ~ '^[A-Z]{2}$'),
  category       text references public.news_categories (code) on update cascade on delete set null,
  relevance      text check (relevance in ('muito_alta', 'alta', 'media', 'baixa')),
  relevance_reasons jsonb,
  status         text not null default 'open'
                   check (status in ('open', 'verifying', 'verified', 'analyzing', 'analyzed',
                                     'approved', 'rejected', 'published', 'discarded', 'error')),
  article_count  int not null default 0,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (scope <> 'estadual' or state is not null)
);
create index if not exists news_clusters_status_idx on public.news_clusters (status, last_seen_at desc);
create index if not exists news_clusters_scope_idx  on public.news_clusters (scope, state, last_seen_at desc);

-- ---------------------------------------------------------------------
-- 4. Notícias coletadas
-- ---------------------------------------------------------------------
create table if not exists public.news (
  id               uuid primary key default gen_random_uuid(),
  source_id        uuid not null references public.news_sources (id) on delete restrict,
  cluster_id       uuid references public.news_clusters (id) on delete set null,
  title            text not null check (char_length(title) <= 500),
  original_url     text not null check (original_url ~ '^https?://' and char_length(original_url) <= 2000),
  canonical_url    text not null check (char_length(canonical_url) <= 2000),
  url_hash         text not null unique check (url_hash ~ '^[a-f0-9]{64}$'),   -- sha256 da URL canônica
  content_hash     text check (content_hash ~ '^[a-f0-9]{64}$'),             -- sha256 do texto normalizado
  original_content text check (char_length(original_content) <= 20000),    -- texto do feed; apagado após 30 dias
  excerpt          text check (char_length(excerpt) <= 1000),
  author           text check (char_length(author) <= 200),
  language         text not null default 'pt' check (char_length(language) <= 10),
  published_at     timestamptz,
  collected_at     timestamptz not null default now(),
  scope            text check (scope in ('internacional', 'nacional', 'estadual')),
  state            char(2) check (state ~ '^[A-Z]{2}$'),
  location         text check (char_length(location) <= 200),
  category         text references public.news_categories (code) on update cascade on delete set null,
  relevance        text check (relevance in ('muito_alta', 'alta', 'media', 'baixa')),
  status           text not null default 'collected'
                     check (status in ('collected', 'discarded', 'triaged', 'clustered', 'error')),
  discard_reason   text check (char_length(discard_reason) <= 300),
  error            text check (char_length(error) <= 1000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists news_status_idx    on public.news (status, collected_at desc);
create index if not exists news_published_idx on public.news (published_at desc);
create index if not exists news_cluster_idx   on public.news (cluster_id);
create index if not exists news_source_idx    on public.news (source_id, collected_at desc);
create index if not exists news_content_idx   on public.news (content_hash) where content_hash is not null;

-- ---------------------------------------------------------------------
-- 5. Verificações (histórico; a mais recente vale)
-- ---------------------------------------------------------------------
create table if not exists public.news_verifications (
  id                       uuid primary key default gen_random_uuid(),
  cluster_id               uuid not null references public.news_clusters (id) on delete cascade,
  verification_status      text not null check (verification_status in (
                             'corroborada', 'parcialmente_corroborada', 'nao_confirmada',
                             'fontes_divergentes', 'contradita', 'insuficiente')),
  claims                   jsonb not null default '[]',   -- afirmações extraídas
  evidence                 jsonb not null default '[]',   -- trechos + URL (sempre de notícias/fontes no banco)
  supporting_news_ids      uuid[] not null default '{}',
  contradictory_news_ids   uuid[] not null default '{}',
  independent_sources      int not null default 0,
  confidence_level         text not null check (confidence_level in ('alta', 'media', 'baixa')),
  analysis                 text check (char_length(analysis) <= 5000),
  needs_human_review       boolean not null default false,
  provider                 text,
  model                    text,
  verified_at              timestamptz not null default now()
);
create index if not exists news_verifications_cluster_idx on public.news_verifications (cluster_id, verified_at desc);

-- ---------------------------------------------------------------------
-- 6. Análises editoriais/pedagógicas da IA (histórico; versão válida mais recente)
-- ---------------------------------------------------------------------
create table if not exists public.news_analyses (
  id                     uuid primary key default gen_random_uuid(),
  cluster_id             uuid not null references public.news_clusters (id) on delete cascade,
  provider               text not null,
  model                  text not null,
  prompt_version         text not null,
  input_hash             text not null check (input_hash ~ '^[a-f0-9]{64}$'),  -- reaproveitamento sem nova chamada
  status                 text not null default 'valid' check (status in ('valid', 'invalid', 'superseded', 'edited')),
  editorial_title        text check (char_length(editorial_title) <= 300),
  summary                text,
  what_happened          text,
  context                text,
  historical_background  text,
  political_analysis     text,
  economic_analysis      text,
  social_impact          text,
  why_it_matters         text,
  consequences           jsonb,          -- { confirmados: [], projecoes: [] }
  relevance_for_exams    text,
  possible_exam_topics   text[] not null default '{}',
  memorize               text[] not null default '{}',
  exam_approaches        text[] not null default '{}',
  questions              jsonb not null default '[]',
  "references"           jsonb not null default '[]',   -- somente URLs existentes no banco
  content                jsonb not null,                 -- saída completa validada por schema
  validation_errors      jsonb,
  edited_by              uuid references auth.users (id) on delete set null,
  generated_at           timestamptz not null default now()
);
create index if not exists news_analyses_cluster_idx on public.news_analyses (cluster_id, generated_at desc);
create unique index if not exists news_analyses_input_uq on public.news_analyses (cluster_id, input_hash, prompt_version, model)
  where status = 'valid';

-- ---------------------------------------------------------------------
-- 7. Revisões editoriais (auditoria das decisões humanas)
-- ---------------------------------------------------------------------
create table if not exists public.editorial_reviews (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('cluster', 'analysis', 'edition', 'document', 'source')),
  target_id   uuid not null,
  action      text not null check (action in ('approve', 'reject', 'edit', 'request_reanalysis', 'publish', 'unpublish', 'regenerate')),
  reviewer_id uuid references auth.users (id) on delete set null,
  notes       text check (char_length(notes) <= 2000),
  changes     jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists editorial_reviews_target_idx on public.editorial_reviews (target_type, target_id, created_at desc);

-- ---------------------------------------------------------------------
-- 8. Edições (diária/semanal/mensal por estado) e seus itens
-- ---------------------------------------------------------------------
create table if not exists public.editions (
  id             uuid primary key default gen_random_uuid(),
  edition_type   text not null check (edition_type in ('diaria', 'semanal', 'mensal')),
  state          char(2) not null check (state ~ '^[A-Z]{2}$'),
  period_start   timestamptz not null,
  period_end     timestamptz not null,
  reference_date date not null,
  status         text not null default 'draft'
                   check (status in ('draft', 'in_review', 'approved', 'generating', 'generated', 'published', 'failed')),
  current_version int not null default 0,
  summary        jsonb,                -- resumo executivo / panorama
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (edition_type, reference_date, state),
  check (period_end > period_start)
);
create index if not exists editions_status_idx on public.editions (status, reference_date desc);

create table if not exists public.edition_items (
  edition_id  uuid not null references public.editions (id) on delete cascade,
  analysis_id uuid not null references public.news_analyses (id) on delete restrict,
  block       text not null check (block in ('estado', 'nacional', 'internacional')),
  position    int not null check (position >= 0),
  primary key (edition_id, analysis_id)
);
create index if not exists edition_items_order_idx on public.edition_items (edition_id, block, position);

-- ---------------------------------------------------------------------
-- 9. Documentos gerados (PDF base por edição/estado, com versões)
-- ---------------------------------------------------------------------
create table if not exists public.generated_documents (
  id               uuid primary key default gen_random_uuid(),
  edition_id       uuid not null references public.editions (id) on delete cascade,
  version          int not null check (version >= 1),
  storage_path     text not null unique check (char_length(storage_path) <= 300),
  template_version text not null,
  file_size        int check (file_size >= 0),
  page_count       int check (page_count >= 0),
  checksum         text check (checksum ~ '^[a-f0-9]{64}$'),
  qa_status        text not null default 'pending' check (qa_status in ('pending', 'passed', 'failed')),
  qa_report        jsonb,
  status           text not null default 'generated' check (status in ('generated', 'approved', 'published', 'superseded', 'deleted')),
  approved_by      uuid references auth.users (id) on delete set null,
  approved_at      timestamptz,
  created_at       timestamptz not null default now(),
  unique (edition_id, version)
);

-- ---------------------------------------------------------------------
-- 10. Entregas (PDF individual por assinante; idempotente)
-- ---------------------------------------------------------------------
create table if not exists public.document_deliveries (
  id                uuid primary key default gen_random_uuid(),
  document_id       uuid not null references public.generated_documents (id) on delete cascade,
  user_id           uuid not null references public.profiles (id) on delete cascade,
  channel           text not null check (channel in ('area', 'email')),
  personalized_path text check (char_length(personalized_path) <= 300),  -- cópia com nome/e-mail (mantida 7 dias)
  status            text not null default 'pending' check (status in ('pending', 'prepared', 'sent', 'failed', 'skipped')),
  attempts          int not null default 0,
  error             text check (char_length(error) <= 1000),
  sent_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (document_id, user_id, channel)
);
create index if not exists document_deliveries_user_idx on public.document_deliveries (user_id, created_at desc);
create index if not exists document_deliveries_status_idx on public.document_deliveries (status, created_at);

-- ---------------------------------------------------------------------
-- 11. Fila de tarefas do worker
-- ---------------------------------------------------------------------
create table if not exists public.processing_jobs (
  id           uuid primary key default gen_random_uuid(),
  job_type     text not null check (job_type in ('healthcheck', 'collect', 'triage', 'cluster', 'verify', 'analyze',
                                                 'compose', 'render', 'personalize', 'deliver', 'cleanup')),
  payload      jsonb not null default '{}',
  dedupe_key   text unique check (char_length(dedupe_key) <= 200),   -- idempotência
  status       text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'dead')),
  priority     smallint not null default 5 check (priority between 1 and 9),
  attempts     int not null default 0,
  max_attempts int not null default 5 check (max_attempts between 1 and 20),
  run_after    timestamptz not null default now(),
  locked_at    timestamptz,
  locked_by    text check (char_length(locked_by) <= 100),
  last_error   text check (char_length(last_error) <= 2000),
  result       jsonb,
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists processing_jobs_ready_idx on public.processing_jobs (status, priority, run_after)
  where status in ('queued', 'failed');

-- Retira até p_limit tarefas prontas, com trava de linha (vários workers sem conflito).
-- Tarefas "running" há mais de 30 min são consideradas abandonadas e voltam à fila.
create or replace function public.claim_jobs(p_worker text, p_types text[], p_limit int default 1)
returns setof public.processing_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.processing_jobs
     set status = 'failed', last_error = 'tarefa abandonada (timeout do worker)', locked_at = null, locked_by = null
   where status = 'running' and locked_at < now() - interval '30 minutes';

  return query
  update public.processing_jobs j
     set status = 'running', locked_at = now(), locked_by = left(p_worker, 100),
         attempts = j.attempts + 1, started_at = coalesce(j.started_at, now())
   where j.id in (
     select id from public.processing_jobs
      where status in ('queued', 'failed')
        and attempts < max_attempts
        and run_after <= now()
        and (p_types is null or job_type = any (p_types))
      order by priority, run_after
      limit greatest(1, least(p_limit, 50))
      for update skip locked
   )
  returning j.*;
end;
$$;

-- Finaliza uma tarefa: sucesso, ou falha com nova tentativa em backoff exponencial
-- (1, 2, 4, 8… min, máx. 60) até max_attempts; depois vira "dead".
create or replace function public.finish_job(p_id uuid, p_ok boolean, p_error text default null, p_result jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.processing_jobs j
     set status      = case when p_ok then 'succeeded' when j.attempts >= j.max_attempts then 'dead' else 'failed' end,
         last_error  = case when p_ok then null else left(p_error, 2000) end,
         result      = coalesce(p_result, j.result),
         run_after   = case when p_ok then j.run_after
                            else now() + make_interval(mins => least(60, power(2, greatest(j.attempts - 1, 0))::int)) end,
         finished_at = case when p_ok or j.attempts >= j.max_attempts then now() else null end,
         locked_at   = null,
         locked_by   = null
   where j.id = p_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 12. Consumo de IA
-- ---------------------------------------------------------------------
create table if not exists public.ai_usage_logs (
  id                bigint generated always as identity primary key,
  provider          text not null,
  model             text not null,
  task              text not null check (char_length(task) <= 40),
  job_id            uuid references public.processing_jobs (id) on delete set null,
  prompt_tokens     int,
  completion_tokens int,
  total_tokens      int,
  latency_ms        int,
  status            text not null check (status in ('ok', 'error', 'timeout', 'rate_limited', 'invalid_output')),
  http_status       int,
  error             text check (char_length(error) <= 1000),
  created_at        timestamptz not null default now()
);
create index if not exists ai_usage_logs_time_idx on public.ai_usage_logs (created_at desc);
create index if not exists ai_usage_logs_model_idx on public.ai_usage_logs (provider, model, created_at desc);

-- ---------------------------------------------------------------------
-- 13. Configurações editáveis pelo painel (modelo por tarefa, horários, revisão)
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key        text primary key check (key ~ '^[a-z0-9_.]{2,80}$'),
  value      jsonb not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('pipeline.pilot_states',     '["CE"]'),
  ('pipeline.timezone',         '"America/Sao_Paulo"'),
  ('pipeline.edition_cutoff',   '"22:00"'),
  ('pipeline.review_deadline',  '"04:30"'),
  ('pipeline.publish_time',     '"06:00"'),
  ('pipeline.collect_every_minutes', '180'),
  ('editorial.review_mode',     '"manual_com_aprovacao_automatica_alta_confianca"'),
  ('ai.provider',               '"nvidia"'),
  ('ai.models',                 '{}'),
  ('ai.daily_call_budget',      '60'),
  ('storage.retention_days',    '{"base": 90, "personalizado": 7}')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 14. Gatilhos updated_at
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['news_sources', 'news_clusters', 'news', 'editions', 'document_deliveries']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 15. RLS e permissões
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['news_categories', 'news_source_groups', 'news_sources', 'news_clusters', 'news',
                           'news_verifications', 'news_analyses', 'editorial_reviews', 'editions', 'edition_items',
                           'generated_documents', 'document_deliveries', 'processing_jobs', 'ai_usage_logs', 'app_settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end;
$$;
grant usage, select on sequence public.ai_usage_logs_id_seq to service_role;

-- Assinante: lê somente as próprias entregas (lista "Meus materiais")
grant select (id, document_id, channel, status, sent_at, created_at) on table public.document_deliveries to authenticated;
drop policy if exists "document_deliveries: ler as próprias" on public.document_deliveries;
create policy "document_deliveries: ler as próprias" on public.document_deliveries
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on function public.claim_jobs(text, text[], int)        from public, anon, authenticated;
revoke all on function public.finish_job(uuid, boolean, text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_jobs(text, text[], int)        to service_role;
grant execute on function public.finish_job(uuid, boolean, text, jsonb) to service_role;

-- ---------------------------------------------------------------------
-- 16. Storage: bucket PRIVADO para os PDFs (sem políticas para o site;
--     acesso apenas por link temporário assinado no servidor)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 20971520, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- 17. Retenção (LGPD/direitos autorais/volume) — amplia apply_retention
-- ---------------------------------------------------------------------
create or replace function public.apply_retention()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Etapa 1
  delete from public.payment_events where received_at < now() - interval '12 months';
  delete from public.email_log      where created_at  < now() - interval '24 months';
  delete from public.leads l
   where l.created_at < now() - interval '24 months'
     and not exists (select 1 from public.profiles p where lower(p.email) = lower(l.email));
  delete from public.rate_limits    where window_start < now() - interval '2 days';
  delete from public.access_logs    where accessed_at  < now() - interval '6 months';
  -- Etapa 2
  update public.news set original_content = null
   where original_content is not null and collected_at < now() - interval '30 days';  -- direitos autorais
  delete from public.news where status = 'discarded' and collected_at < now() - interval '30 days';
  delete from public.processing_jobs where status in ('succeeded', 'dead') and created_at < now() - interval '30 days';
  delete from public.ai_usage_logs where created_at < now() - interval '12 months';
end;
$$;
revoke all on function public.apply_retention() from public, anon, authenticated;
