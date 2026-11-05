import { isIP } from 'node:net'

/**
 * Proteção contra SSRF: endereços que o coletor NUNCA pode acessar
 * (rede interna, loopback, metadados de nuvem, multicast, reservados).
 */
function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, p) => (acc << 8) + Number(p), 0) >>> 0
}

const V4_BLOCKED: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]

function v4Blocked(ip: string): boolean {
  const n = ipv4ToInt(ip)
  return V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
    return (n & mask) === (ipv4ToInt(base) & mask)
  })
}

export function isBlockedIp(address: string): boolean {
  const kind = isIP(address)
  if (kind === 4) return v4Blocked(address)
  if (kind === 6) {
    const a = address.toLowerCase().split('%')[0]
    if (a === '::' || a === '::1') return true
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return v4Blocked(mapped[1])
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(a)) return true // IPv4 mapeado em hexa: bloquear por segurança
    const first = parseInt(a.split(':')[0] || '0', 16)
    if ((first & 0xfe00) === 0xfc00) return true // fc00::/7 (ULA)
    if ((first & 0xffc0) === 0xfe80) return true // fe80::/10 (link-local)
    if ((first & 0xff00) === 0xff00) return true // multicast
    if (a.startsWith('64:ff9b:') || a.startsWith('2001:db8:') || a.startsWith('2001:0db8:')) return true
    return false
  }
  return true // não é IP válido
}

/** Host permitido: igual ou subdomínio de um host da lista da fonte. */
export function hostAllowed(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, '')
  return allowed.some((a) => {
    const x = a.toLowerCase()
    return h === x || h.endsWith('.' + x)
  })
}
