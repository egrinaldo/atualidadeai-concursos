-- =====================================================================
-- AtualidadeAI Concursos — Migração 2/4: permissões e RLS
-- ---------------------------------------------------------------------
-- Duas camadas de proteção:
--   1. GRANTs: definem QUAIS tabelas/colunas cada papel pode acessar.
--      (Desde 30/10/2026 o Supabase não concede acesso automático a
--      tabelas novas — por isso os GRANTs são explícitos.)
--   2. RLS: define QUAIS LINHAS cada usuário enxerga.
--
-- Papéis:
--   anon          → visitante sem login (chave publishable)
--   authenticated → usuário logado
--   service_role  → backend (Edge Functions, chave secreta; ignora RLS)
-- Script reexecutável.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Habilitar RLS em todas as tabelas
-- ---------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.plans            enable row level security;
alter table public.subscriptions    enable row level security;
alter table public.payments         enable row level security;
alter table public.user_preferences enable row level security;
alter table public.leads            enable row level security;

-- ---------------------------------------------------------------------
-- 2. GRANTs — começa fechado e libera apenas o necessário
-- ---------------------------------------------------------------------
revoke all on table
  public.profiles, public.plans, public.subscriptions,
  public.payments, public.user_preferences, public.leads
from anon, authenticated;

-- Visitantes e usuários: leem planos (RLS limita aos ativos)
grant select on table public.plans to anon, authenticated;

-- Usuário logado: lê o próprio perfil e altera SOMENTE nome, estado e cidade
-- (e-mail e aceite de termos não podem ser alterados pelo navegador)
grant select on table public.profiles to authenticated;
grant update (full_name, state, city) on table public.profiles to authenticated;

-- Usuário logado: lê as próprias assinaturas e pagamentos (sem escrita)
grant select on table public.subscriptions to authenticated;
grant select on table public.payments      to authenticated;

-- Usuário logado: gerencia as próprias preferências
grant select, insert, update on table public.user_preferences to authenticated;

-- leads: nenhum acesso direto para anon/authenticated (usar capture_lead)

-- Backend (Edge Functions via supabase-js com chave secreta)
grant select, insert, update, delete on table
  public.profiles, public.plans, public.subscriptions,
  public.payments, public.user_preferences, public.leads
to service_role;

-- ---------------------------------------------------------------------
-- 3. Políticas RLS
--    (select auth.uid()) é avaliado uma vez por consulta → mais rápido.
-- ---------------------------------------------------------------------

-- profiles
drop policy if exists "profiles: ler o próprio" on public.profiles;
create policy "profiles: ler o próprio" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles: atualizar o próprio" on public.profiles;
create policy "profiles: atualizar o próprio" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- plans
drop policy if exists "plans: ler planos ativos" on public.plans;
create policy "plans: ler planos ativos" on public.plans
  for select to anon, authenticated
  using (is_active);

-- subscriptions
drop policy if exists "subscriptions: ler as próprias" on public.subscriptions;
create policy "subscriptions: ler as próprias" on public.subscriptions
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- payments
drop policy if exists "payments: ler os próprios" on public.payments;
create policy "payments: ler os próprios" on public.payments
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- user_preferences
drop policy if exists "user_preferences: ler as próprias" on public.user_preferences;
create policy "user_preferences: ler as próprias" on public.user_preferences
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "user_preferences: criar as próprias" on public.user_preferences;
create policy "user_preferences: criar as próprias" on public.user_preferences
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "user_preferences: atualizar as próprias" on public.user_preferences;
create policy "user_preferences: atualizar as próprias" on public.user_preferences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- leads: RLS habilitado SEM políticas → bloqueado para anon/authenticated.
