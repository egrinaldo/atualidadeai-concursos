-- =====================================================================
-- AtualidadeAI Concursos — Migração 11: registros de acesso (Marco Civil)
-- ---------------------------------------------------------------------
-- Lei 12.965/2014, art. 15: o provedor de aplicação deve manter os
-- registros de acesso (data/hora e IP) por 6 meses, em sigilo.
-- Cada login (nova sessão no Supabase Auth) gera um registro aqui.
-- Sem chave estrangeira de propósito: o registro deve permanecer pelo
-- prazo legal mesmo se a conta for excluída. Acesso só pelo backend.
-- Script reexecutável.
-- =====================================================================
create table if not exists public.access_logs (
  id          bigint generated always as identity primary key,
  user_id     uuid not null,
  ip          inet,
  user_agent  text check (char_length(user_agent) <= 500),
  aal         text,
  accessed_at timestamptz not null default now()
);
create index if not exists access_logs_user_idx on public.access_logs (user_id, accessed_at desc);
create index if not exists access_logs_time_idx on public.access_logs (accessed_at);

alter table public.access_logs enable row level security;
revoke all on table public.access_logs from anon, authenticated;
grant select, insert, delete on table public.access_logs to service_role;

create or replace function public.log_session_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.access_logs (user_id, ip, user_agent, aal, accessed_at)
  values (new.user_id, new.ip, left(new.user_agent, 500), new.aal::text, coalesce(new.created_at, now()));
  return new;
exception when others then
  -- O registro nunca pode impedir o login
  return new;
end;
$$;
revoke all on function public.log_session_access() from public, anon, authenticated;

drop trigger if exists on_auth_session_created on auth.sessions;
create trigger on_auth_session_created
  after insert on auth.sessions
  for each row execute function public.log_session_access();

-- Retenção: inclui os registros de acesso (6 meses) na rotina diária
create or replace function public.apply_retention()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.payment_events where received_at < now() - interval '12 months';
  delete from public.email_log      where created_at  < now() - interval '24 months';
  delete from public.leads l
   where l.created_at < now() - interval '24 months'
     and not exists (select 1 from public.profiles p where lower(p.email) = lower(l.email));
  delete from public.rate_limits    where window_start < now() - interval '2 days';
  delete from public.access_logs    where accessed_at  < now() - interval '6 months';
end;
$$;
revoke all on function public.apply_retention() from public, anon, authenticated;
