-- =====================================================================
-- AtualidadeAI Concursos — Migração 5: integração Mercado Pago
-- ---------------------------------------------------------------------
-- 1. Colunas de controle em subscriptions (status bruto do provedor,
--    próxima cobrança, link de pagamento, cancelamento).
-- 2. payment_events: registro (auditoria) de toda notificação recebida.
-- Somente o backend (service_role) acessa payment_events.
-- Script reexecutável.
-- =====================================================================

alter table public.subscriptions
  add column if not exists provider_status text,
  add column if not exists next_payment_at timestamptz,
  add column if not exists cancelled_at    timestamptz,
  add column if not exists checkout_url    text check (checkout_url is null or checkout_url ~ '^https://');

comment on column public.subscriptions.provider_status is 'Status original no Mercado Pago (pending, authorized, paused, cancelled).';
comment on column public.subscriptions.next_payment_at is 'Próxima cobrança prevista pelo Mercado Pago.';
comment on column public.subscriptions.checkout_url    is 'Link (init_point) para o assinante concluir o pagamento.';

-- Busca rápida da assinatura pendente/ativa de um usuário
create index if not exists subscriptions_user_status_idx on public.subscriptions (user_id, status);

-- ---------------------------------------------------------------------
-- payment_events — notificações recebidas (webhook) e sincronizações
-- ---------------------------------------------------------------------
create table if not exists public.payment_events (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null default 'mercadopago' check (provider in ('mercadopago')),
  source          text not null default 'webhook' check (source in ('webhook', 'sync', 'checkout')),
  topic           text,
  action          text,
  resource_id     text,
  request_id      text,
  signature_valid boolean,
  status          text not null default 'received'
                    check (status in ('received', 'processed', 'ignored', 'failed', 'rejected')),
  error           text,
  payload         jsonb,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz
);

comment on table public.payment_events is 'Auditoria das notificações do Mercado Pago. Acesso exclusivo do backend.';

create index if not exists payment_events_resource_idx on public.payment_events (topic, resource_id);
create index if not exists payment_events_received_idx on public.payment_events (received_at desc);

alter table public.payment_events enable row level security;
revoke all on table public.payment_events from anon, authenticated;
grant select, insert, update, delete on table public.payment_events to service_role;
-- Sem políticas: inacessível pelo navegador.
