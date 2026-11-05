-- =====================================================================
-- AtualidadeAI Concursos — Migração 3/4: funções de cadastro e leads
-- ---------------------------------------------------------------------
-- 1. handle_new_user: ao criar uma conta no Supabase Auth, cria
--    automaticamente o perfil e as preferências a partir dos dados
--    enviados no cadastro (options.data do signUp).
-- 2. handle_user_email_change: mantém profiles.email sincronizado.
-- 3. capture_lead: única forma de o site gravar um lead.
--
-- Funções SECURITY DEFINER usam search_path vazio e nomes totalmente
-- qualificados (boa prática de segurança do Postgres/Supabase).
-- Script reexecutável.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Normalizadores reutilizáveis
-- ---------------------------------------------------------------------
create or replace function public.normalize_uf(value text)
returns char(2)
language sql
immutable
set search_path = ''
as $$
  select case
    when upper(btrim(value)) ~ '^[A-Z]{2}$' then upper(btrim(value))::char(2)
    else null
  end;
$$;

create or replace function public.normalize_text(value text, max_len int)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(btrim(regexp_replace(coalesce(value, ''), '\s+', ' ', 'g')), max_len), '');
$$;

-- ---------------------------------------------------------------------
-- 1. Perfil automático no cadastro
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_uf  char(2) := public.normalize_uf(meta ->> 'state');
  v_city text := public.normalize_text(meta ->> 'city', 120);
begin
  insert into public.profiles (id, email, full_name, state, city, terms_accepted_at)
  values (
    new.id,
    lower(new.email),
    coalesce(public.normalize_text(meta ->> 'full_name', 120), ''),
    v_uf,
    v_city,
    case when (meta ->> 'terms_accepted') = 'true' then now() else null end
  )
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id, state, city)
  values (new.id, v_uf, v_city)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. Sincronizar e-mail quando o usuário trocar o e-mail no Auth
-- ---------------------------------------------------------------------
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = lower(new.email) where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------
-- 3. Captação de leads
--    - Valida e normaliza os dados.
--    - E-mail repetido NÃO gera erro nem altera o registro existente
--      (evita expor quais e-mails já estão cadastrados e impede que
--      terceiros sobrescrevam dados de um lead).
-- ---------------------------------------------------------------------
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
begin
  if v_name is null then
    raise exception 'Informe o nome.' using errcode = '22023';
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Informe um e-mail válido.' using errcode = '22023';
  end if;

  insert into public.leads (name, email, state, city)
  values (v_name, v_email, public.normalize_uf(p_state), public.normalize_text(p_city, 120))
  on conflict ((lower(email))) do nothing;
end;
$$;

comment on function public.capture_lead(text, text, text, text) is
  'Registra um lead a partir do site. Chamada via supabase.rpc(''capture_lead'', {...}).';

-- Permissões das funções: só capture_lead é chamável pelo site
revoke all on function public.capture_lead(text, text, text, text) from public;
grant execute on function public.capture_lead(text, text, text, text) to anon, authenticated, service_role;

revoke all on function public.handle_new_user()          from public, anon, authenticated;
revoke all on function public.handle_user_email_change() from public, anon, authenticated;
