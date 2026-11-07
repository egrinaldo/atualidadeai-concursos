-- =====================================================================
-- Migração 24 — Etapa 2.9: agendador confiável (pg_cron + pg_net disparando os workflows do GitHub)
-- O agendador do GitHub atrasa horas ou pula execuções (observado em 06/11). O banco passa a disparar os
-- workflows nos horários certos via API (workflow_dispatch). Os agendamentos do GitHub ficam como reserva:
-- as rodadas das edições são idempotentes por dia (TICK_SLOT=edition), então disparo duplo não repete trabalho.
-- Ativação: guardar no Vault o token do GitHub com nome 'github_dispatch_token' (ver docs/OPERACAO.md).
-- Sem o token, as funções não fazem nada (só registram o aviso). Idempotente.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

insert into public.app_settings (key, value) values
  ('ops.github_repo', '"egrinaldo/atualidadeai-concursos"'),
  ('ops.github_ref', '"main"')
on conflict (key) do nothing;

-- Registro dos disparos (para conferir a resposta do GitHub; net._http_response também guarda outras chamadas)
create table if not exists public.dispatch_log (
  request_id bigint primary key,
  workflow text not null,
  inputs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.dispatch_log enable row level security;
revoke all on public.dispatch_log from anon, authenticated;
create index if not exists dispatch_log_created_idx on public.dispatch_log (created_at desc);

-- Dispara um workflow permitido. SECURITY DEFINER: lê o token no Vault; ninguém além do postgres/cron executa.
create or replace function public.dispatch_workflow(p_workflow text, p_inputs jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_repo text;
  v_ref text;
  v_id bigint;
begin
  if p_workflow not in ('worker-collect.yml', 'worker-edition.yml') then
    raise exception 'workflow não permitido: %', p_workflow;
  end if;
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'github_dispatch_token' limit 1;
  if coalesce(v_token, '') = '' then
    raise notice 'agendador: github_dispatch_token ausente no Vault — % não disparado', p_workflow;
    return null;
  end if;
  select value #>> '{}' into v_repo from public.app_settings where key = 'ops.github_repo';
  select value #>> '{}' into v_ref from public.app_settings where key = 'ops.github_ref';
  select net.http_post(
    url := format('https://api.github.com/repos/%s/actions/workflows/%s/dispatches', v_repo, p_workflow),
    body := jsonb_build_object('ref', coalesce(v_ref, 'main'), 'inputs', coalesce(p_inputs, '{}'::jsonb)),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'atualidadeai-agendador',
      'Content-Type', 'application/json'),
    timeout_milliseconds := 15000
  ) into v_id;
  insert into public.dispatch_log (request_id, workflow, inputs) values (v_id, p_workflow, coalesce(p_inputs, '{}'::jsonb))
  on conflict (request_id) do nothing;
  return v_id;
end $$;
revoke all on function public.dispatch_workflow(text, jsonb) from public, anon, authenticated;
grant execute on function public.dispatch_workflow(text, jsonb) to service_role;

-- Resultado dos disparos das últimas N horas (o GitHub responde 204 quando aceita). Usado pelo alerta diário.
drop function if exists public.dispatch_recent(int);
create or replace function public.dispatch_recent(p_hours int default 24)
returns table (created timestamptz, workflow text, inputs jsonb, status_code int, error text)
language sql
security definer
set search_path = ''
as $$
  select d.created_at, d.workflow, d.inputs, r.status_code, coalesce(r.error_msg, left(r.content, 200))
    from public.dispatch_log d
    left join net._http_response r on r.id = d.request_id
   where d.created_at > now() - make_interval(hours => greatest(1, least(p_hours, 168)))
   order by d.created_at desc
   limit 100
$$;
revoke all on function public.dispatch_recent(int) from public, anon, authenticated;
grant execute on function public.dispatch_recent(int) to service_role;

-- Agendamentos (pg_cron usa UTC; Brasília = UTC−3). Recriados para ficarem idempotentes.
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname in ('worker-collect', 'worker-compose', 'worker-render', 'worker-deliver') loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;
select cron.schedule('worker-collect', '7 */3 * * *', $$select public.dispatch_workflow('worker-collect.yml')$$);
select cron.schedule('worker-compose', '12 1 * * *', $$select public.dispatch_workflow('worker-edition.yml', '{"step":"compose","origem":"agendador"}')$$);
select cron.schedule('worker-render', '35 7 * * *', $$select public.dispatch_workflow('worker-edition.yml', '{"step":"render","origem":"agendador"}')$$);
select cron.schedule('worker-deliver', '57 8 * * *', $$select public.dispatch_workflow('worker-edition.yml', '{"step":"deliver","origem":"agendador"}')$$);

-- Higiene: funções de gatilho não são chamadas por usuários
revoke all on function public.news_analyses_reset_audit_on_edit() from public, anon, authenticated;

-- Alerta operacional diário (worker healthcheck)
insert into public.app_settings (key, value) values ('ops.alert_email', 'true') on conflict (key) do nothing;
