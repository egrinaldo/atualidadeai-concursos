-- Desfaz a migração 27 sem apagar dados coletados: desativa as fontes da Bahia e tira BA do piloto.
update public.news_sources set is_active = false, updated_at = now() where state = 'BA' and scope = 'estadual';
update public.app_settings
   set value = coalesce((select jsonb_agg(x order by x) from jsonb_array_elements_text(value) as t(x) where x <> 'BA'), '[]'::jsonb), updated_at = now()
 where key = 'pipeline.pilot_states';
