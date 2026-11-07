-- =====================================================================
-- Migração 26 — assinatura mensal passa de R$ 10,00 para R$ 9,99 (decisão do responsável, 07/11/2026)
-- Vale para novas assinaturas: o valor é lido do plano na criação da assinatura no Mercado Pago.
-- =====================================================================
update public.plans set price = 9.99, updated_at = now() where code = 'mensal' and price <> 9.99;
