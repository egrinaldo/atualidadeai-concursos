-- =====================================================================
-- Migração 23 — administradores recebem os informativos como um cliente (para conferência)
-- =====================================================================
insert into public.app_settings (key, value) values ('delivery.include_admins', 'true')
on conflict (key) do nothing;
