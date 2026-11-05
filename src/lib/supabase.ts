import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, isSupabaseConfigured } from '@/config/env'
import type { Database } from '@/types/database'

/**
 * Cliente Supabase do frontend (usa apenas a chave PÚBLICA).
 *
 * Enquanto as variáveis não estiverem configuradas (Subetapa 3), o
 * cliente é `null` e a aplicação continua funcionando normalmente.
 * Use `getSupabase()` em código que exige o cliente — ele lança um erro
 * claro caso a configuração esteja ausente.
 */
export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // PKCE: nenhum token de sessão trafega na URL. Os links de e-mail
        // (confirmação e recuperação) usam token_hash + verifyOtp e por isso
        // continuam funcionando em outro navegador ou dispositivo.
        flowType: 'pkce',
      },
    })
  : null

export function getSupabase(): SupabaseClient<Database> {
  if (!supabase) {
    throw new Error(
      'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env.local (ver docs/CONFIGURACAO.md).',
    )
  }
  return supabase
}
