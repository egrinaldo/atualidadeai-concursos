-- =====================================================================
-- REVERSÃO da migração 12 (Etapa 2.1). APAGA os dados da Etapa 2
-- (notícias, análises, edições, entregas, fila). Não toca na Etapa 1.
-- Executar somente com autorização. Os PDFs do bucket "documents" devem
-- ser removidos antes pelo painel do Supabase (Storage) ou pelo worker.
-- =====================================================================
begin;
select cron.unschedule(jobid) from cron.job where jobname like 'etapa2-%';
drop function if exists public.claim_jobs(text, text[], int);
drop function if exists public.finish_job(uuid, boolean, text, jsonb);
drop table if exists public.document_deliveries;
drop table if exists public.generated_documents;
drop table if exists public.edition_items;
drop table if exists public.editions;
drop table if exists public.editorial_reviews;
drop table if exists public.news_analyses;
drop table if exists public.news_verifications;
drop table if exists public.news;
drop table if exists public.news_clusters;
drop table if exists public.news_sources;
drop table if exists public.news_source_groups;
drop table if exists public.news_categories;
drop table if exists public.ai_usage_logs;
drop table if exists public.processing_jobs;
drop table if exists public.app_settings;
delete from storage.buckets where id = 'documents' and not exists (select 1 from storage.objects where bucket_id = 'documents');
-- apply_retention volta à versão da migração 11 (reexecutar 20261105180000_registros_de_acesso.sql)
commit;
