/** Utilitários HTTP das Edge Functions (CORS e respostas JSON). */

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export function tooManyRequests(): Response {
  return new Response(JSON.stringify({ error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.' }), {
    status: 429,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '120' },
  })
}

export function preflight(req: Request): Response | null {
  return req.method === 'OPTIONS' ? new Response('ok', { headers: corsHeaders }) : null
}

export function requireEnv(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`)
  return v
}

/** Mensagem segura para logs (sem tokens). */
export function errorMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  return m.replace(/(APP_USR|TEST)-[\w-]{10,}/g, '[token]').slice(0, 500)
}

/** Provedor (Mercado Pago) pediu para esperar (HTTP 429): responde 503 "tente em instantes" com Retry-After. */
export function providerBusy(retryAfterSeconds = 30): Response {
  return new Response(JSON.stringify({ error: 'O Mercado Pago está recebendo muitos pedidos agora. Tente novamente em alguns segundos.' }), {
    status: 503,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': String(retryAfterSeconds) },
  })
}
