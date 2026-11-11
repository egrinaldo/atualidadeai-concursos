-- Desfaz a migração 29: volta o plano mensal a R$ 9,99 sem promoção. As colunas novas ficam (sem efeito) para não
-- perder o histórico das assinaturas criadas na Black Friday; remova manualmente se necessário.
update public.plans set price = 9.99, intro_price = null, intro_until = null, intro_label = null, updated_at = now() where code = 'mensal';
