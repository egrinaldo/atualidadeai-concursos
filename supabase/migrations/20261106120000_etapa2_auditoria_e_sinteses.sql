-- =====================================================================
-- Migração 20 — Etapa 2.7b: auditoria de veracidade e sínteses semanais/mensais
-- Só acrescenta colunas, valores permitidos, índices e configurações; não altera nem apaga dados. Idempotente.
-- =====================================================================

-- 1. Tipo do texto: análise de um assunto (padrão — todas as linhas existentes) ou síntese de período
alter table public.news_analyses add column if not exists kind text not null default 'analise';
alter table public.news_analyses drop constraint if exists news_analyses_kind_check;
alter table public.news_analyses add constraint news_analyses_kind_check
  check (kind in ('analise', 'sintese_semanal', 'sintese_mensal'));
-- Síntese: edição/UF/período, assuntos e análises de origem, datas e linha do tempo
alter table public.news_analyses add column if not exists period_meta jsonb;

-- 2. Auditoria de veracidade (segundo modelo confere cada afirmação contra as fontes, com trecho literal)
alter table public.news_analyses add column if not exists audit_status text not null default 'pendente';
alter table public.news_analyses drop constraint if exists news_analyses_audit_status_check;
alter table public.news_analyses add constraint news_analyses_audit_status_check
  check (audit_status in ('pendente', 'aprovada', 'reprovada', 'erro', 'dispensada'));
alter table public.news_analyses add column if not exists audit_report jsonb;
alter table public.news_analyses add column if not exists audit_model text;
alter table public.news_analyses add column if not exists audit_hash text;
alter table public.news_analyses add column if not exists audited_at timestamptz;

create index if not exists news_analyses_audit_idx on public.news_analyses (audit_status, generated_at desc)
  where status in ('valid', 'edited');
create index if not exists news_analyses_audit_hash_idx on public.news_analyses (audit_hash) where audit_hash is not null;
create index if not exists news_analyses_kind_idx on public.news_analyses (kind, generated_at desc) where kind <> 'analise';

-- Versão editada por pessoa nasce SEMPRE pendente de auditoria (mesmo que quem a crie copie a linha anterior)
create or replace function public.news_analyses_reset_audit_on_edit()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'edited' then
    new.audit_status := 'pendente';
    new.audit_report := null;
    new.audit_model := null;
    new.audit_hash := null;
    new.audited_at := null;
  end if;
  return new;
end $$;
drop trigger if exists news_analyses_reset_audit_on_edit on public.news_analyses;
create trigger news_analyses_reset_audit_on_edit before insert on public.news_analyses
  for each row execute function public.news_analyses_reset_audit_on_edit();

-- 3. Novos tipos de tarefa do robô
alter table public.processing_jobs drop constraint if exists processing_jobs_job_type_check;
alter table public.processing_jobs add constraint processing_jobs_job_type_check
  check (job_type in ('healthcheck', 'collect', 'triage', 'cluster', 'verify', 'analyze', 'audit', 'synthesize',
                      'compose', 'render', 'personalize', 'deliver', 'cleanup'));

-- 4. Decisões do editor sobre a auditoria
alter table public.editorial_reviews drop constraint if exists editorial_reviews_action_check;
alter table public.editorial_reviews add constraint editorial_reviews_action_check
  check (action in ('approve', 'reject', 'edit', 'request_reanalysis', 'publish', 'unpublish', 'regenerate',
                    'hold', 'add_item', 'remove_item', 'move_item', 'create', 'update', 'waive_audit', 'request_audit'));

-- 5. Configurações
insert into public.app_settings (key, value) values
  ('audit.enabled', 'true'),
  ('audit.max_per_run', '8'),
  ('audit.auto_correct', 'true'),
  ('synthesis.max_calls_per_run', '12'),
  ('synthesis.similarity_threshold', '0.4')
on conflict (key) do nothing;

-- Modelo auditor (diferente do redator): acrescenta a chave "audit" sem mexer nas demais
update public.app_settings
   set value = value || '{"audit": ["nvidia/nemotron-3-ultra-550b-a55b", "nvidia/nemotron-3.5-lightning-30b-a3b"],
                         "synthesis": ["nvidia/nemotron-3.5-lightning-30b-a3b", "nvidia/nemotron-3-ultra-550b-a55b"]}'::jsonb
 where key = 'ai.models' and not (value ? 'audit');

-- A auditoria (≈20 chamadas/dia) e as sínteses usam a mesma cota: 60 → 120 se ainda estiver no valor original
update public.app_settings set value = '120' where key = 'ai.daily_call_budget' and value = '60'::jsonb;
