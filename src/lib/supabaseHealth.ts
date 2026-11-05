import { isSupabaseConfigured } from '@/config/env'
import { supabase } from '@/lib/supabase'

export type HealthResult =
  | { status: 'not-configured' }
  | { status: 'ok'; plans: { code: string; name: string; price: number }[] }
  | { status: 'error'; message: string; hint: string }

/**
 * Verifica a conexão com o Supabase usando apenas a chave pública:
 * lê a tabela `plans` (liberada para visitantes pelas políticas RLS).
 */
export async function checkSupabaseConnection(): Promise<HealthResult> {
  if (!isSupabaseConfigured || !supabase) return { status: 'not-configured' }

  try {
    const { data, error } = await supabase.from('plans').select('code, name, price').order('price')
    if (error) return { status: 'error', message: error.message, hint: hintFor(error.code, error.message) }
    return { status: 'ok', plans: data ?? [] }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { status: 'error', message, hint: 'Verifique a VITE_SUPABASE_URL e sua conexão com a internet.' }
  }
}

function hintFor(code: string | undefined, message: string): string {
  if (code === '42P01' || code === 'PGRST205' || /does not exist|could not find the table/i.test(message))
    return 'A tabela não existe: execute os scripts de supabase/migrations no SQL Editor.'
  if (code === '42501' || /permission denied/i.test(message))
    return 'Sem permissão: execute novamente o script 20261104120100_rls_e_permissoes.sql.'
  if (/invalid api key|jwt|apikey/i.test(message))
    return 'Chave inválida: confira a VITE_SUPABASE_PUBLISHABLE_KEY (Settings → API Keys).'
  return 'Consulte docs/CONFIGURACAO.md, seção Supabase.'
}
