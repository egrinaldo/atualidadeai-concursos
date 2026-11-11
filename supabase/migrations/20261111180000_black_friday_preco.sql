-- =====================================================================
-- Migração 29 — preço de produção R$ 29,90 e Black Friday (decisão do responsável, 11/11/2026)
-- - plans.price passa a R$ 29,90 (preço normal da assinatura mensal).
-- - Preço de entrada (intro): R$ 9,90 no 1º mês para quem assinar até 29/11/2026 23:59 (Brasília).
--   Depois do 1º pagamento aprovado, o backend reajusta a assinatura no Mercado Pago para o preço normal e avisa o
--   assinante por e-mail antes da 2ª cobrança (supabase/functions/_shared/sync.ts).
-- - subscriptions.agreed_amount = valor combinado na criação (conferido na ativação);
--   intro_pending = ainda falta reajustar para o preço normal; price_adjusted_at = quando foi reajustada.
-- Só acrescenta colunas; idempotente. Rollback: supabase/rollback/20261111180000_black_friday_preco.down.sql
-- =====================================================================
alter table public.plans
  add column if not exists intro_price numeric(10, 2) check (intro_price is null or intro_price >= 0),
  add column if not exists intro_until timestamptz,
  add column if not exists intro_label text check (intro_label is null or char_length(intro_label) <= 60);

comment on column public.plans.intro_price is 'Preço do 1º mês para quem assinar até intro_until (promoção). Nulo = sem promoção.';
comment on column public.plans.intro_until is 'Fim da promoção do 1º mês (exclusivo).';

alter table public.subscriptions
  add column if not exists agreed_amount numeric(10, 2),
  add column if not exists intro_pending boolean not null default false,
  add column if not exists price_adjusted_at timestamptz;

comment on column public.subscriptions.agreed_amount is 'Valor enviado ao Mercado Pago na criação (promoção ou preço normal).';
comment on column public.subscriptions.intro_pending is 'true = assinou com preço de entrada e ainda falta reajustar para o preço normal.';

update public.plans
   set price = 29.90,
       intro_price = 9.90,
       intro_until = '2026-11-30 03:00:00+00',  -- 30/11/2026 00:00 em Brasília (fim de 29/11)
       intro_label = 'Black Friday',
       updated_at = now()
 where code = 'mensal';
