-- =====================================================================
-- AtualidadeAI Concursos — Migração 10: endurecimento de segurança
-- (auditoria de 05/11/2026 — itens V04, V05, V06, V08, V09, V13)
-- ---------------------------------------------------------------------
-- Não apaga nem altera dados existentes. Script reexecutável.
-- =====================================================================

-- ---------------------------------------------------------------------
-- V06. Privilégios padrão: novas tabelas/funções/sequências criadas no
-- schema public deixam de ser liberadas automaticamente para anon e
-- authenticated. Cada migração passa a conceder explicitamente.
-- ---------------------------------------------------------------------
alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, public;

do $$
begin
  -- Objetos criados pelo papel interno do Supabase (quando permitido)
  execute 'alter default privileges for role supabase_admin in schema public revoke all on tables from anon, authenticated';
  execute 'alter default privileges for role supabase_admin in schema public revoke all on sequences from anon, authenticated';
  execute 'alter default privileges for role supabase_admin in schema public revoke all on functions from anon, authenticated, public';
exception when insufficient_privilege then
  raise notice 'Sem permissão para alterar privilégios padrão de supabase_admin (objetos criados por migrações usam o papel postgres).';
end;
$$;

-- Funções utilitárias sem uso pelo site: execução só pelo backend
revoke all on function public.normalize_text(text, int) from public, anon, authenticated;
revoke all on function public.normalize_uf(text)        from public, anon, authenticated;
revoke all on function public.set_updated_at()          from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- V13. user_preferences: o usuário só altera os campos de preferência
-- (não id, user_id ou datas).
-- ---------------------------------------------------------------------
revoke insert, update on table public.user_preferences from authenticated;
grant insert (user_id, state, city, interests) on table public.user_preferences to authenticated;
grant update (state, city, interests)          on table public.user_preferences to authenticated;

-- ---------------------------------------------------------------------
-- V05 / V04. Limite de requisições (janela fixa), usado pelas Edge
-- Functions e pela captação de leads. Sem acesso pelo site.
-- ---------------------------------------------------------------------
create table if not exists public.rate_limits (
  key          text primary key check (char_length(key) <= 200),
  window_start timestamptz not null default now(),
  hits         int not null default 0
);
alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from anon, authenticated;
grant all on table public.rate_limits to service_role;

create or replace function public.rate_limit_hit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits int;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (left(p_key, 200), now(), 1)
  on conflict (key) do update set
    hits         = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end;
$$;
revoke all on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;

-- capture_lead: mesmo comportamento, agora com limite por IP e global.
-- Ao exceder, ignora em silêncio (o cadastro do usuário não é afetado).
create or replace function public.capture_lead(
  p_name  text,
  p_email text,
  p_state text default null,
  p_city  text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name  text := public.normalize_text(p_name, 120);
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_ip    text := btrim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', 'sem-ip'), ',', 1));
begin
  if v_name is null then
    raise exception 'Informe o nome.' using errcode = '22023';
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Informe um e-mail válido.' using errcode = '22023';
  end if;

  if not public.rate_limit_hit('lead:ip:' || v_ip, 10, 3600)
     or not public.rate_limit_hit('lead:global', 300, 3600) then
    return;
  end if;

  insert into public.leads (name, email, state, city)
  values (v_name, v_email, public.normalize_uf(p_state), public.normalize_text(p_city, 120))
  on conflict ((lower(email))) do nothing;
end;
$$;
revoke all on function public.capture_lead(text, text, text, text) from public;
grant execute on function public.capture_lead(text, text, text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- V09. Webhook: guarda o carimbo de tempo da assinatura para descartar
-- reenvios idênticos de uma notificação já processada.
-- ---------------------------------------------------------------------
alter table public.payment_events add column if not exists signature_ts text check (char_length(signature_ts) <= 40);
create index if not exists payment_events_request_idx on public.payment_events (request_id, signature_ts) where request_id is not null;

-- ---------------------------------------------------------------------
-- V08. Retenção de dados (LGPD) — prazos padrão, ajustáveis:
--   payment_events: 12 meses · email_log: 24 meses
--   leads que nunca viraram cadastro: 24 meses · rate_limits: 2 dias
-- Pagamentos (payments) NÃO são apagados: registros financeiros.
-- ---------------------------------------------------------------------
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
end;
$$;
revoke all on function public.apply_retention() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'lgpd-retencao') then
    perform cron.unschedule('lgpd-retencao');
  end if;
  perform cron.schedule('lgpd-retencao', '41 6 * * *', 'select public.apply_retention()');
end;
$$;
