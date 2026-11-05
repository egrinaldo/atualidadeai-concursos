-- =====================================================================
-- AtualidadeAI Concursos — Migração 8: pg_net fora do schema public
-- ---------------------------------------------------------------------
-- Recomendação do Security Advisor do Supabase (extension_in_public).
-- As funções do pg_net continuam no schema "net" (net.http_post), então
-- o agendamento da conciliação não muda. Script reexecutável.
-- =====================================================================
do $$
begin
  if exists (
    select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_net' and n.nspname = 'public'
  ) then
    drop extension pg_net;
  end if;
end;
$$;

create schema if not exists extensions;
create extension if not exists pg_net with schema extensions;
