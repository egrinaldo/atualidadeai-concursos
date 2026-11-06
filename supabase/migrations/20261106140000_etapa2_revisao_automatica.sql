-- =====================================================================
-- Migração 21 — Etapa 2.7c: revisão automática da fila (robô decide; editor pode desfazer)
-- Só acrescenta valores permitidos e configurações. Idempotente.
-- =====================================================================
alter table public.processing_jobs drop constraint if exists processing_jobs_job_type_check;
alter table public.processing_jobs add constraint processing_jobs_job_type_check
  check (job_type in ('healthcheck', 'collect', 'triage', 'cluster', 'verify', 'analyze', 'audit', 'review', 'synthesize',
                      'compose', 'render', 'personalize', 'deliver', 'cleanup'));

insert into public.app_settings (key, value) values
  ('review.auto', 'true'),            -- robô resolve a fila de revisão
  ('review.max_reanalysis', '1')      -- novas análises que o robô pode pedir por assunto antes de descartar
on conflict (key) do nothing;
