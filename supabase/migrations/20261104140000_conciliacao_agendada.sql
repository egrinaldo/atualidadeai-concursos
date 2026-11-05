-- =====================================================================
-- AtualidadeAI Concursos — Migração 6: conciliação agendada com o Mercado Pago
-- ---------------------------------------------------------------------
-- A cada 6 horas o banco chama a Edge Function mp-reconcile, que consulta
-- no Mercado Pago as assinaturas em andamento e atualiza o banco.
-- Garante a atualização mesmo se uma notificação (webhook) se perder.
--
-- O segredo NÃO fica neste arquivo: é lido do Supabase Vault
-- (vault.decrypted_secrets, nomes 'mp_reconcile_url' e 'cron_secret'),
-- cadastrados à parte — ver docs/CONFIGURACAO.md.
-- Script reexecutável.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Remove o agendamento anterior (se existir) e recria
select cron.unschedule(jobid) from cron.job where jobname = 'mp-reconcile';

select cron.schedule(
  'mp-reconcile',
  '17 */6 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'mp_reconcile_url'),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
