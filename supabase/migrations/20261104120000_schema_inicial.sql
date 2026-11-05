-- =====================================================================
-- AtualidadeAI Concursos — Migração 1/4: estrutura inicial
-- ---------------------------------------------------------------------
-- Cria as tabelas, chaves estrangeiras, restrições e índices.
-- Script reexecutável: pode ser rodado novamente sem erro.
--
-- Senhas NÃO são armazenadas aqui: ficam exclusivamente no Supabase Auth
-- (schema auth). As tabelas públicas referenciam auth.users pelo id.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Função utilitária: mantém a coluna updated_at atualizada
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- profiles — dados cadastrais (1:1 com auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  full_name         text not null default '' check (char_length(full_name) <= 120),
  email             text not null check (char_length(email) <= 254),
  state             char(2) check (state ~ '^[A-Z]{2}$'),
  city              text check (char_length(city) <= 120),
  terms_accepted_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.profiles is 'Dados cadastrais do usuário. Criado automaticamente no cadastro (trigger em auth.users).';
comment on column public.profiles.terms_accepted_at is 'Momento do aceite dos Termos de Uso e da Política de Privacidade.';

create unique index if not exists profiles_email_lower_key on public.profiles (lower(email));

-- ---------------------------------------------------------------------
-- plans — planos comerciais (preço configurável pelo banco)
-- ---------------------------------------------------------------------
create table if not exists public.plans (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique check (code ~ '^[a-z0-9_-]{2,40}$'),
  name           text not null check (char_length(name) between 1 and 80),
  description    text not null default '' check (char_length(description) <= 500),
  price          numeric(10, 2) not null check (price >= 0),
  currency       char(3) not null default 'BRL',
  billing_period text not null check (billing_period in ('monthly', 'quarterly', 'yearly')),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.plans is 'Planos de assinatura. O frontend lê apenas os planos ativos.';
comment on column public.plans.code is 'Identificador estável usado no código e nas URLs (ex.: mensal).';

create index if not exists plans_is_active_idx on public.plans (is_active);

-- ---------------------------------------------------------------------
-- subscriptions — assinaturas (atualizadas SOMENTE pelo backend)
-- ---------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.profiles (id) on delete cascade,
  plan_id                  uuid not null references public.plans (id) on delete restrict,
  provider                 text not null default 'mercadopago' check (provider in ('mercadopago')),
  external_subscription_id text unique,
  status                   text not null default 'pending'
                             check (status in ('pending', 'active', 'paused', 'cancelled', 'expired')),
  started_at               timestamptz,
  expires_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (expires_at is null or started_at is null or expires_at >= started_at)
);

comment on table public.subscriptions is 'Assinaturas. Alteradas apenas por Edge Functions após confirmação na API do Mercado Pago.';
comment on column public.subscriptions.external_subscription_id is 'ID da assinatura (preapproval) no Mercado Pago.';

create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);
create index if not exists subscriptions_plan_id_idx on public.subscriptions (plan_id);
create index if not exists subscriptions_status_idx  on public.subscriptions (status);
-- No máximo UMA assinatura ativa por usuário
create unique index if not exists subscriptions_one_active_per_user
  on public.subscriptions (user_id) where status = 'active';

-- ---------------------------------------------------------------------
-- payments — pagamentos confirmados (idempotência por external_payment_id)
-- ---------------------------------------------------------------------
create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  -- user_id/subscription_id ficam nulos se o usuário for excluído:
  -- o histórico financeiro é preservado.
  user_id             uuid references public.profiles (id) on delete set null,
  subscription_id     uuid references public.subscriptions (id) on delete set null,
  provider            text not null default 'mercadopago' check (provider in ('mercadopago')),
  external_payment_id text not null unique,
  amount              numeric(10, 2) not null check (amount >= 0),
  currency            char(3) not null default 'BRL',
  status              text not null
                        check (status in ('pending', 'approved', 'authorized', 'in_process', 'in_mediation',
                                          'rejected', 'cancelled', 'refunded', 'charged_back')),
  status_detail       text,
  paid_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.payments is 'Pagamentos. Gravados apenas pelo webhook, após consulta à API do Mercado Pago.';
comment on column public.payments.external_payment_id is 'ID do pagamento no Mercado Pago. UNIQUE garante idempotência do webhook.';

create index if not exists payments_user_id_idx         on public.payments (user_id);
create index if not exists payments_subscription_id_idx on public.payments (subscription_id);
create index if not exists payments_status_idx          on public.payments (status);

-- ---------------------------------------------------------------------
-- user_preferences — personalização das atualidades
-- ---------------------------------------------------------------------
create table if not exists public.user_preferences (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references public.profiles (id) on delete cascade,
  state      char(2) check (state ~ '^[A-Z]{2}$'),
  city       text check (char_length(city) <= 120),
  interests  text[] not null default '{}' check (cardinality(interests) <= 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_preferences is 'Estado, cidade e interesses usados para personalizar os materiais.';

-- ---------------------------------------------------------------------
-- leads — contatos captados antes da contratação
-- ---------------------------------------------------------------------
create table if not exists public.leads (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 120),
  email      text not null check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  state      char(2) check (state ~ '^[A-Z]{2}$'),
  city       text check (char_length(city) <= 120),
  source     text not null default 'landing' check (char_length(source) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.leads is 'Leads. Inseridos somente pela função public.capture_lead(); sem leitura pública.';

create unique index if not exists leads_email_lower_key on public.leads (lower(email));
create index if not exists leads_created_at_idx on public.leads (created_at desc);

-- ---------------------------------------------------------------------
-- Triggers de updated_at
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'plans', 'subscriptions', 'payments', 'user_preferences', 'leads']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end;
$$;
