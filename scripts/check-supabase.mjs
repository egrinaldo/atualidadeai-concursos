/**
 * Verifica a conexão com o Supabase e as permissões básicas, usando a
 * MESMA chave pública que o site usa (nenhum segredo é necessário).
 *
 * Uso:  npm run check:supabase
 * (lê as variáveis de .env.local)
 */
import { createClient } from '@supabase/supabase-js'

const rawUrl = (process.env.VITE_SUPABASE_URL ?? '').trim().replace(/^["']|["']$/g, '')
// Aceita a URL copiada com /rest/v1/ no final, mas avisa
const url = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '')
const key = (process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim().replace(/^["']|["']$/g, '')

let failures = 0
const ok = (msg) => console.log(`  ✓ ${msg}`)
const fail = (msg, hint) => {
  failures++
  console.log(`  ✗ ${msg}`)
  if (hint) console.log(`      → ${hint}`)
}

console.log('\nVerificação do Supabase — AtualidadeAI Concursos\n')

if (!url || !key) {
  fail('Variáveis ausentes', 'Preencha VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no arquivo .env.local (ou .env) na raiz do projeto')
  process.exit(1)
}
if (key.startsWith('sb_secret_')) {
  fail('A chave informada é SECRETA', 'Use a Publishable key (sb_publishable_...). Nunca coloque a secret key no .env.local do frontend.')
  process.exit(1)
}
if (rawUrl !== url) {
  console.log('  ! A URL termina com /rest/v1/ — use apenas https://<id>.supabase.co (corrigido automaticamente neste teste)')
}
if (/^eyJ/.test(key)) {
  const role = (() => { try { return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role } catch { return '?' } })()
  if (role === 'service_role') {
    fail('A chave informada é a service_role (SECRETA)', 'Use a Publishable key (sb_publishable_...) ou a anon key.')
    process.exit(1)
  }
  console.log(`  ! Usando chave legada (${role}). Funciona, mas prefira a Publishable key (sb_publishable_...): as legadas serão descontinuadas até o fim de 2026.`)
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) {
  console.log(`  ! URL fora do padrão https://<id>.supabase.co (${url}) — continuando mesmo assim`)
}
ok(`Variáveis presentes (${new URL(url).host})`)

const supabase = createClient(url, key, { auth: { persistSession: false } })

// 1. Leitura pública dos planos
{
  const { data, error } = await supabase.from('plans').select('code, name, price, is_active')
  if (error && /fetch failed|network|ENOTFOUND|getaddrinfo/i.test(error.message)) {
    fail('Não foi possível conectar ao Supabase', 'Confira a VITE_SUPABASE_URL (Settings → API Keys / Connect) e sua internet.')
    process.exit(1)
  }
  if (error && (error.code === 'PGRST205' || /could not find the table|does not exist/i.test(error.message))) {
    ok('Conexão com o Supabase OK (URL e chave válidas)')
    fail('As tabelas ainda não existem no banco', 'Execute os 4 scripts de supabase/migrations no SQL Editor, em ordem (docs/CONFIGURACAO.md §3.3).')
    process.exit(1)
  }
  if (error) {
    fail(`Leitura de plans: ${error.message}`, /does not exist|could not find/i.test(error.message)
      ? 'Execute os scripts de supabase/migrations no SQL Editor (em ordem).'
      : /invalid api key|apikey/i.test(error.message)
        ? 'Chave inválida: copie novamente em Settings → API Keys.'
        : 'Confira a URL, a chave e se as migrações foram executadas.')
  } else if (!data.length) {
    fail('Nenhum plano ativo', 'Execute 20261104120300_dados_iniciais_planos.sql')
  } else {
    ok(`Conexão OK — planos ativos: ${data.map((p) => `${p.name} R$ ${Number(p.price).toFixed(2)}`).join(', ')}`)
  }
}

// 2. Visitante NÃO pode ler dados protegidos
for (const table of ['profiles', 'subscriptions', 'payments', 'leads']) {
  const { data, error } = await supabase.from(table).select('id').limit(1)
  const denied = error && (error.code === '42501' || /permission denied/i.test(error.message))
  if (denied || (!error && Array.isArray(data) && data.length === 0)) ok(`Visitante sem acesso a ${table}`)
  else if (error) fail(`Erro inesperado em ${table}: ${error.message}`, 'Confira se as migrações foram executadas.')
  else fail(`Visitante conseguiu ler ${table}!`, 'Execute novamente 20261104120100_rls_e_permissoes.sql')
}

// 3. Função de leads acessível (chamada com dados inválidos: não grava nada)
{
  const { error } = await supabase.rpc('capture_lead', { p_name: 'teste', p_email: 'invalido' })
  if (error && /e-mail válido/i.test(error.message)) ok('Função capture_lead disponível e validando dados')
  else if (error) fail(`capture_lead: ${error.message}`, 'Execute 20261104120200_funcoes_cadastro_e_leads.sql')
  else fail('capture_lead aceitou e-mail inválido', 'Execute novamente 20261104120200_funcoes_cadastro_e_leads.sql')
}

console.log(failures ? `\n${failures} problema(s) encontrado(s).\n` : '\nTudo certo! Banco configurado corretamente.\n')
process.exit(failures ? 1 : 0)
