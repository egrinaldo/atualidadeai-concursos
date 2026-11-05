import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Config } from '../config.ts'

/** Cliente com a chave secreta do worker (ignora RLS — usar só no servidor). */
export function dbClient(config: Config): SupabaseClient {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-Client-Info': `atualidadeai-worker/${config.workerId}` } },
  })
}
