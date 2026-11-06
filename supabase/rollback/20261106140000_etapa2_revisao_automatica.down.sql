-- Reversão da migração 21. Decisões já tomadas pelo robô (editorial_reviews com reviewer_id nulo) são mantidas.
begin;
delete from public.app_settings where key in ('review.auto', 'review.max_reanalysis');
delete from public.processing_jobs where job_type = 'review';
alter table public.processing_jobs drop constraint if exists processing_jobs_job_type_check;
alter table public.processing_jobs add constraint processing_jobs_job_type_check
  check (job_type in ('healthcheck', 'collect', 'triage', 'cluster', 'verify', 'analyze', 'audit', 'synthesize',
                      'compose', 'render', 'personalize', 'deliver', 'cleanup'));
commit;
