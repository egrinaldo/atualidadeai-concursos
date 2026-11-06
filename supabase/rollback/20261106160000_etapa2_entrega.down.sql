-- Reversão da migração 22. Entregas já registradas são mantidas.
begin;
delete from public.app_settings where key in ('delivery.email_enabled', 'delivery.personalized_days', 'delivery.base_days');
revoke execute on function public.apply_retention() from service_role;
drop index if exists public.document_deliveries_document_idx;
drop index if exists public.document_deliveries_cleanup_idx;
commit;
