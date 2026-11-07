-- Reversão da migração 24: remove os agendamentos e as funções do agendador (o token no Vault é mantido;
-- apague-o em Supabase → Vault se quiser). Os workflows voltam a depender só do agendador do GitHub.
begin;
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname in ('worker-collect', 'worker-compose', 'worker-render', 'worker-deliver') loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;
drop function if exists public.dispatch_recent(int);
drop function if exists public.dispatch_workflow(text, jsonb);
drop table if exists public.dispatch_log;
delete from public.app_settings where key in ('ops.github_repo', 'ops.github_ref', 'ops.alert_email');
commit;
