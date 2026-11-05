-- =====================================================================
-- AtualidadeAI Concursos — Migração 4/4: dados iniciais
-- ---------------------------------------------------------------------
-- Plano único definido pelo responsável: assinatura mensal de R$ 10,00.
--
-- Para alterar o preço depois, NÃO edite este arquivo; rode no
-- SQL Editor:
--   update public.plans set price = 12.90 where code = 'mensal';
--
-- Reexecutável: se o plano já existir, nada é alterado.
-- =====================================================================

insert into public.plans (code, name, description, price, currency, billing_period, is_active)
values (
  'mensal',
  'Assinatura mensal',
  'Acesso completo a todos os materiais, com renovação automática todo mês.',
  10.00,
  'BRL',
  'monthly',
  true
)
on conflict (code) do nothing;
