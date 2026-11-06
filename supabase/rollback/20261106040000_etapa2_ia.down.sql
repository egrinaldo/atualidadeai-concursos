-- Reversão da migração 16 (Etapa 2.5). As análises e registros de uso já gravados são preservados.
begin;
drop index if exists public.news_analyses_lookup_idx;
drop index if exists public.ai_usage_logs_created_idx;
delete from public.app_settings where key in ('ai.analysis_per_block', 'ai.max_calls_per_run', 'ai.lookback_hours');
update public.app_settings set value = '{}' where key = 'ai.models';
commit;
