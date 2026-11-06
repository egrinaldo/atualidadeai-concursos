-- =====================================================================
-- Migração 18 — Etapa 2.6: edições e PDFs
-- Apenas configurações e índices; não altera nem apaga dados. Idempotente.
-- =====================================================================

-- Quantos assuntos por bloco em cada tipo de edição (ordem fixa: Estado → Nacional → Internacional)
insert into public.app_settings (key, value) values
  ('edition.items_per_block', '{"diaria": {"estado": 5, "nacional": 6, "internacional": 4},
                                "semanal": {"estado": 8, "nacional": 10, "internacional": 6},
                                "mensal": {"estado": 10, "nacional": 14, "internacional": 8}}'),
  ('edition.template_version', '"informativo-v1"')
on conflict (key) do nothing;

create index if not exists editions_reference_idx on public.editions (reference_date desc, state, edition_type);
create index if not exists generated_documents_edition_idx on public.generated_documents (edition_id, version desc);
