-- =====================================================================
-- Migração 16 — Etapa 2.5: camada de IA (NVIDIA NIM)
-- Apenas configurações e índices; não altera nem apaga dados existentes. Idempotente.
-- =====================================================================

-- Modelos de análise verificados na conta em 05/11/2026 (ordem = preferência).
-- Só preenche se ainda estiver vazio: uma escolha feita pelo painel não é sobrescrita.
update public.app_settings
   set value = '{"analysis": ["nvidia/nemotron-3.5-lightning-30b-a3b", "nvidia/nemotron-3-ultra-550b-a55b"]}'
 where key = 'ai.models' and value = '{}'::jsonb;

insert into public.app_settings (key, value) values
  ('ai.analysis_per_block', '{"estado": 5, "nacional": 6, "internacional": 4}'),
  ('ai.max_calls_per_run',  '6'),
  ('ai.lookback_hours',     '36')
on conflict (key) do nothing;

-- Consulta da cota diária (chamadas do dia) e das análises por assunto
create index if not exists ai_usage_logs_created_idx on public.ai_usage_logs (created_at desc);
create index if not exists news_analyses_lookup_idx on public.news_analyses (cluster_id, input_hash, prompt_version, status);
