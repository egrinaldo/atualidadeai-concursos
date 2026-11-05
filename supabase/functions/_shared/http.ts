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
