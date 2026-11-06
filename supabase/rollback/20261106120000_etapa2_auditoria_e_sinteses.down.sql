-- Reversão da migração 20 (Etapa 2.7b). ATENÇÃO: apaga o resultado das auditorias e as sínteses de período
-- (as análises diárias são preservadas). Falha se houver tarefas/decisões com os novos tipos — trate-as antes.
begin;
update public.app_settings set value = '60' where key = 'ai.daily_call_budget' and value = '120'::jsonb;
update public.app_settings set value = value - 'audit' - 'synthesis' where key = 'ai.models';
delete from public.app_settings where key in ('audit.enabled', 'audit.max_per_run', 'audit.auto_correct', 'synthesis.max_calls_per_run', 'synthesis.similarity_threshold');

alter table public.editorial_reviews drop constraint if exists editorial_reviews_action_check;
alter table public.editorial_reviews add constraint editorial_reviews_action_check
  check (action in ('approve', 'reject', 'edit', 'request_reanalysis', 'publish', 'unpublish', 'regenerate',
                    'hold', 'add_item', 'remove_item', 'move_item', 'create', 'update'));
alter table public.processing_jobs drop constraint if exists processing_jobs_job_type_check;
alter table public.processing_jobs add constraint processing_jobs_job_type_check
  check (job_type in ('healthcheck', 'collect', 'triage', 'cluster', 'verify', 'analyze',
                      'compose', 'render', 'personalize', 'deliver', 'cleanup'));

-- Itens de edição que apontam para sínteses deixam de existir junto com elas
delete from public.edition_items where analysis_id in (select id from public.news_analyses where kind <> 'analise');
delete from public.news_analyses where kind <> 'analise';

drop trigger if exists news_analyses_reset_audit_on_edit on public.news_analyses;
drop function if exists public.news_analyses_reset_audit_on_edit();
drop index if exists public.news_analyses_kind_idx;
drop index if exists public.news_analyses_audit_hash_idx;
drop index if exists public.news_analyses_audit_idx;
alter table public.news_analyses drop constraint if exists news_analyses_audit_status_check;
alter table public.news_analyses drop constraint if exists news_analyses_kind_check;
alter table public.news_analyses
  drop column if exists audited_at, drop column if exists audit_hash, drop column if exists audit_model,
  drop column if exists audit_report, drop column if exists audit_status, drop column if exists period_meta, drop column if exists kind;
commit;
