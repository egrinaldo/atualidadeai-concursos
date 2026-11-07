-- Reversão da migração 25 (volta à leitura direta de net._http_response)
begin;
do $$ declare j record; begin
  for j in select jobid from cron.job where jobname = 'dispatch-capture' loop perform cron.unschedule(j.jobid); end loop;
end $$;
drop function if exists public.dispatch_capture();
alter table public.dispatch_log drop column if exists error, drop column if exists status_code;
commit;
