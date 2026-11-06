-- =====================================================================
-- Migração 22 — Etapa 2.8: personalização, publicação, entrega e limpeza
-- Só acrescenta índices, permissões e configurações. Idempotente.
-- =====================================================================

-- Limpeza das cópias personalizadas (7 dias) e listagem da área do assinante
create index if not exists document_deliveries_cleanup_idx on public.document_deliveries (created_at)
  where personalized_path is not null;
create index if not exists document_deliveries_document_idx on public.document_deliveries (document_id, channel, status);

-- A limpeza diária do worker chama a retenção do banco (antes ela não tinha quem a executasse)
grant execute on function public.apply_retention() to service_role;

insert into public.app_settings (key, value) values
  ('delivery.email_enabled', 'false'),  -- envio por e-mail: só liga com autorização (envios reais)
  ('delivery.personalized_days', '7'),  -- dias que a cópia personalizada fica disponível
  ('delivery.base_days', '90')          -- dias que o PDF base é guardado
on conflict (key) do nothing;
