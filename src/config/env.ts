/**
 * Leitura centralizada das variáveis de ambiente PÚBLICAS do frontend.
 *
 * Somente variáveis com prefixo VITE_ chegam ao navegador — e por isso
 * NUNCA devem conter segredos (service role, access tokens etc.).
 * Segredos ficam nas Supabase Edge Functions (ver docs/CONFIGURACAO.md).
 */

function read(value: string | undefined): string {
  return (value ?? '').trim().replace(/^["']|["']$/g, '')
}

/** Aceita a URL com "/rest/v1/" ou barra no final (erro comum ao copiar do painel). */
function normalizeSupabaseUrl(value: string): string {
  return value.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '')
}

export const env = {
  siteUrl: read(import.meta.env.VITE_SITE_URL) || 'http://localhost:5173',
  supabaseUrl: normalizeSupabaseUrl(read(import.meta.env.VITE_SUPABASE_URL)),
  supabasePublishableKey: read(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY),
  mercadoPagoPublicKey: read(import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY),
  mode: import.meta.env.MODE,
  isProduction: import.meta.env.PROD,
} as const

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabasePublishableKey)

export const isMercadoPagoConfigured = Boolean(env.mercadoPagoPublicKey)

/**
 * Proteção contra uso acidental de chave secreta no frontend.
 * Chaves secretas do Supabase começam com "sb_secret_"; o Access Token
 * do Mercado Pago começa com "APP_USR-" ou "TEST-" mas é longo e usado
 * apenas no backend — aqui verificamos o padrão inequívoco do Supabase.
 */
function jwtRole(token: string): string | null {
  if (!token.startsWith('eyJ')) return null
  try {
    const part = token.split('.')[1] ?? ''
    return (JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string }).role ?? null
  } catch {
    return null
  }
}

if (env.supabasePublishableKey.startsWith('sb_secret_') || jwtRole(env.supabasePublishableKey) === 'service_role') {
  throw new Error(
    'VITE_SUPABASE_PUBLISHABLE_KEY contém uma chave SECRETA do Supabase. ' +
      'Use a Publishable key (sb_publishable_...) e mova a secreta para as Edge Functions.',
  )
}
