-- =====================================================================
-- Migração 25 — agendador: guarda a resposta do GitHub em dispatch_log
-- O pg_net apaga net._http_response após 6h; a verificação das 06h olhava disparos de até 24h e via
-- "sem resposta" (alarme falso em 07/11). Agora a resposta é copiada para dispatch_log a cada 10 min.
-- =====================================================================
alter table public.dispatch_log add column if not exists status_code int;
alter table public.dispatch_log add column if not exists error text;

create or replace function public.dispatch_capture()
returns int
language sql
security definer
set search_path = ''
as $$
  with upd as (
    update public.dispatch_log d
       set status_code = r.status_code,
           error = coalesce(r.error_msg, left(r.content, 200))
      from net._http_response r
     where r.id = d.request_id and d.status_code is null
    returning 1
  )
  select count(*)::int from upd
$$;
revoke all on function public.dispatch_capture() from public, anon, authenticated;
grant execute on function public.dispatch_capture() to service_role;

drop function if exists public.dispatch_recent(int);
create or replace function public.dispatch_recent(p_hours int default 24)
returns table (created timestamptz, workflow text, inputs jsonb, status_code int, error text)
language sql
security definer
set search_path = ''
as $$
  select d.created_at, d.workflow, d.inputs, coalesce(d.status_code, r.status_code), coalesce(d.error, r.error_msg, left(r.content, 200))
    from public.dispatch_log d
    left join net._http_response r on r.id = d.request_id
   where d.created_at > now() - make_interval(hours => greatest(1, least(p_hours, 168)))
   order by d.created_at desc
   limit 100
$$;
revoke all on function public.dispatch_recent(int) from public, anon, authenticated;
grant execute on function public.dispatch_recent(int) to service_role;

do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname = 'dispatch-capture' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;
select cron.schedule('dispatch-capture', '*/10 * * * *', $$select public.dispatch_capture()$$);
select public.dispatch_capture();
