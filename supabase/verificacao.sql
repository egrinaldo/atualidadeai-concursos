-- =====================================================================
-- AtualidadeAI Concursos — Verificação da instalação do banco
-- ---------------------------------------------------------------------
-- Rode no SQL Editor DEPOIS das 4 migrações. Somente leitura.
-- Resultado esperado: todas as linhas com resultado = 'OK'.
-- =====================================================================

with esperado(tabela) as (
  values ('profiles'), ('plans'), ('subscriptions'), ('payments'), ('user_preferences'), ('leads'), ('payment_events'), ('email_log')
)
select 'Tabela ' || e.tabela || ' existe com RLS' as verificacao,
       case when c.relrowsecurity then 'OK' else 'FALHA' end as resultado
from esperado e
left join pg_class c on c.relname = e.tabela and c.relnamespace = 'public'::regnamespace

union all
select 'Políticas RLS criadas (esperado: 8)',
       case when count(*) = 8 then 'OK' else 'FALHA (' || count(*) || ')' end
from pg_policies where schemaname = 'public'

union all
select 'Plano mensal ativo de R$ 10,00',
       case when exists (select 1 from public.plans where code = 'mensal' and is_active and price = 10.00)
            then 'OK' else 'VERIFICAR (preço pode ter sido alterado)' end

union all
select 'Trigger de perfil automático no cadastro',
       case when exists (select 1 from pg_trigger where tgname = 'on_auth_user_created') then 'OK' else 'FALHA' end

union all
select 'Função capture_lead liberada para visitantes',
       case when has_function_privilege('anon', 'public.capture_lead(text,text,text,text)', 'execute')
            then 'OK' else 'FALHA' end

union all
select 'Visitantes NÃO leem leads',
       case when not has_table_privilege('anon', 'public.leads', 'select') then 'OK' else 'FALHA' end

union all
select 'Visitantes leem planos',
       case when has_table_privilege('anon', 'public.plans', 'select') then 'OK' else 'FALHA' end

union all
select 'Usuário NÃO altera o próprio e-mail no perfil',
       case when not has_column_privilege('authenticated', 'public.profiles', 'email', 'update') then 'OK' else 'FALHA' end

union all
select 'Usuário NÃO grava assinaturas/pagamentos',
       case when not has_table_privilege('authenticated', 'public.subscriptions', 'insert')
             and not has_table_privilege('authenticated', 'public.payments', 'insert') then 'OK' else 'FALHA' end

union all
select 'Eventos de pagamento inacessíveis ao navegador',
       case when not has_table_privilege('anon', 'public.payment_events', 'select')
             and not has_table_privilege('authenticated', 'public.payment_events', 'select') then 'OK' else 'FALHA' end

union all
select 'Registro de e-mails inacessível ao navegador',
       case when not has_table_privilege('anon', 'public.email_log', 'select')
             and not has_table_privilege('authenticated', 'public.email_log', 'select') then 'OK' else 'FALHA' end;
