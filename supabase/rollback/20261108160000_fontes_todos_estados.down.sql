-- Desfaz a migração 28 sem apagar dados coletados: desativa as fontes estaduais das 25 UFs acrescentadas.
update public.news_sources set is_active = false, updated_at = now()
 where scope = 'estadual' and state in ('AC', 'AL', 'AM', 'AP', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO') and created_at >= '2026-11-08';
