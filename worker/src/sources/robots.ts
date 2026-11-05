/**
 * Interpretação de robots.txt (RFC 9309): grupo do nosso robô ou "*",
 * regra mais específica vence; em empate, Allow vence. Crawl-delay respeitado.
 */
export type RobotsRules = { rules: { allow: boolean; pattern: string }[]; crawlDelaySec: number | null }

export function parseRobots(text: string, agent = 'atualidadeai-concursos-bot'): RobotsRules {
  const groups: { agents: string[]; rules: { allow: boolean; pattern: string }[]; delay: number | null }[] = []
  let current: (typeof groups)[number] | null = null
  let lastWasAgent = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    if (!line) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], delay: null }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
      continue
    }
    lastWasAgent = false
    if (!current) continue
    if ((key === 'allow' || key === 'disallow') && value) current.rules.push({ allow: key === 'allow', pattern: value })
    if (key === 'crawl-delay' && /^\d+(\.\d+)?$/.test(value)) current.delay = Number(value)
  }
  const own = groups.filter((g) => g.agents.some((a) => a !== '*' && agent.includes(a)))
  const chosen = own.length ? own : groups.filter((g) => g.agents.includes('*'))
  return {
    rules: chosen.flatMap((g) => g.rules),
    crawlDelaySec: chosen.map((g) => g.delay).find((d) => d != null) ?? null,
  }
}

function toRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith('$')
  const body = (anchored ? pattern.slice(0, -1) : pattern).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp('^' + body + (anchored ? '$' : ''))
}

export function isAllowed(rules: RobotsRules, pathWithQuery: string): boolean {
  let best: { allow: boolean; pattern: string } | null = null
  for (const r of rules.rules) {
    if (!toRegex(r.pattern).test(pathWithQuery)) continue
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r
  }
  return best ? best.allow : true
}
