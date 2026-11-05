/**
 * GET /functions/v1/mp-return   (endereço de retorno do checkout; sem login)
 *
 * O Mercado Pago exige back_url pública em https. Enquanto o site roda em
 * http://localhost (desenvolvimento), o checkout volta para esta função,
 * que apenas redireciona para SITE_URL/pagamento/retorno.
 * Só redireciona para o SITE_URL configurado (sem redirecionamento aberto)
 * e não altera nenhum dado: o status é confirmado pela página via mp-sync.
 */
import { requireEnv } from '../_shared/http.ts'

Deno.serve((req) => {
  const site = requireEnv('SITE_URL').replace(/\/+$/, '')
  const target = new URL(`${site}/pagamento/retorno`)
  const incoming = new URL(req.url)
  for (const key of ['preapproval_id', 'status']) {
    const v = incoming.searchParams.get(key)
    if (v && /^[\w-]{1,80}$/.test(v)) target.searchParams.set(key, v)
  }
  return new Response(null, { status: 302, headers: { Location: target.toString(), 'Cache-Control': 'no-store' } })
})
