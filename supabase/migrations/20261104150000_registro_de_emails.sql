-- =====================================================================
-- AtualidadeAI Concursos — Migração 7: registro de e-mails enviados
-- ---------------------------------------------------------------------
-- email_log garante que cada evento gere no máximo um e-mail
-- (dedupe_key única) e permite auditar envios e falhas.
-- Acesso exclusivo do backend. Script reexecutável.
-- =====================================================================

create table if not exists public.email_log (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references public.profiles (id) on delete set null,
  kind                text not null,
  dedupe_key          text not null unique,
  to_email            text not null,
  delivered_to        text,
  subject             text,
  status              text not null default 'sending' check (status in ('sending', 'sent', 'failed', 'skipped')),
  provider            text,
  provider_message_id text,
  attempts            int  not null default 1 check (attempts between 1 and 10),
  error               text,
  created_at          timestamptz not null default now(),
  sent_at             timestamptz
);

comment on table public.email_log is 'E-mails transacionais (pagamento/assinatura). dedupe_key evita envios duplicados.';
comment on column public.email_log.delivered_to is 'Destino efetivo (difere de to_email quando EMAIL_TEST_TO redireciona em testes).';

create index if not exists email_log_user_idx    on public.email_log (user_id, created_at desc);
create index if not exists email_log_status_idx  on public.email_log (status);

alter table public.email_log enable row level security;
revoke all on table public.email_log from anon, authenticated;
grant select, insert, update, delete on table public.email_log to service_role;
