/**
 * Validação da assinatura das notificações (webhooks) do Mercado Pago.
 *
 * O Mercado Pago envia o cabeçalho  x-signature: ts=<ts>,v1=<hash>
 * e o cabeçalho x-request-id. O hash é um HMAC-SHA256 (hexadecimal) do
 * "manifesto", gerado com a Assinatura secreta configurada no painel:
 *
 *     id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 *
 * - data.id vem da query string da URL notificada;
 * - pares sem valor são omitidos do manifesto;
 * - os SDKs oficiais divergem sobre converter data.id para minúsculas
 *   (relevante só para IDs alfanuméricos), então aceitamos as duas formas.
 *
 * Módulo sem dependências: roda no Deno (Edge Functions) e no Node (testes).
 */

export type SignatureCheck = { valid: true } | { valid: false; reason: string }

export function parseSignatureHeader(header: string | null | undefined): { ts?: string; v1?: string } {
  const out: { ts?: string; v1?: string } = {}
  if (!header) return out
  for (const part of header.split(',')) {
    const [rawKey, ...rest] = part.split('=')
    const key = rawKey?.trim()
    const value = rest.join('=').trim()
    if (key === 'ts') out.ts = value
    if (key === 'v1') out.v1 = value
  }
  return out
}

export function buildManifest(dataId: string | null | undefined, requestId: string | null | undefined, ts: string): string {
  let manifest = ''
  if (dataId) manifest += `id:${dataId};`
  if (requestId) manifest += `request-id:${requestId};`
  if (ts) manifest += `ts:${ts};`
  return manifest
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Comparação em tempo constante (evita ataques de temporização). */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function verifyMercadoPagoSignature(input: {
  xSignature: string | null
  xRequestId: string | null
  dataId: string | null
  secret: string
}): Promise<SignatureCheck> {
  if (!input.secret) return { valid: false, reason: 'secret_not_configured' }
  const { ts, v1 } = parseSignatureHeader(input.xSignature)
  if (!ts || !v1) return { valid: false, reason: 'missing_signature_header' }

  const expected = v1.toLowerCase()
  const candidates = new Set([input.dataId ?? '', (input.dataId ?? '').toLowerCase()])
  for (const id of candidates) {
    const hash = await hmacSha256Hex(input.secret, buildManifest(id, input.xRequestId, ts))
    if (timingSafeEqualHex(hash, expected)) return { valid: true }
  }
  return { valid: false, reason: 'signature_mismatch' }
}
