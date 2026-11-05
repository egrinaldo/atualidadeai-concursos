-- =====================================================================
-- AtualidadeAI Concursos — Migração 9: área administrativa
-- ---------------------------------------------------------------------
-- Lista de administradores. A autorização real acontece na Edge Function
-- "admin" (chave de serviço + conferência nesta tabela). O navegador só
-- consegue ler o PRÓPRIO registro, para decidir se mostra o link do painel.
-- Administradores são incluídos manualmente (SQL ou script), nunca pelo site.
-- Script reexecutável.
-- =====================================================================
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  note       text check (char_length(note) <= 120),
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

revoke all on table public.admins from anon, authenticated;
grant select on table public.admins to authenticated;
grant all on table public.admins to service_role;

drop policy if exists "admins: ler o próprio registro" on public.admins;
create policy "admins: ler o próprio registro" on public.admins
  for select to authenticated
  using (user_id = (select auth.uid()));

comment on table public.admins is
  'Administradores do painel /admin. Inclusão manual; leitura apenas do próprio registro.';
