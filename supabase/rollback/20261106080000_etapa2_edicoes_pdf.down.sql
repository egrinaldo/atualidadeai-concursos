-- Reversão da migração 18 (Etapa 2.6). Edições e documentos gerados são preservados.
begin;
drop index if exists public.generated_documents_edition_idx;
drop index if exists public.editions_reference_idx;
delete from public.app_settings where key in ('edition.items_per_block', 'edition.template_version');
commit;
