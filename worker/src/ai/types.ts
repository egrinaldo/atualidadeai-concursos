/**
 * Abstração de provedor de IA. O restante do worker só conhece esta interface:
 * trocar NVIDIA por outro provedor (pago/licenciado) é escrever uma nova implementação.
 */
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export type ChatRequest = {
  messages: ChatMessage[]
  maxTokens: number
  temperature?: number
  timeoutMs?: number
}

export type ChatResult = {
  text: string
  provider: string
  model: string
  usage: { prompt: number | null; completion: number | null; total: number | null }
  latencyMs: number
}

export interface AIProvider {
  readonly name: string
  chat(model: string, req: ChatRequest): Promise<ChatResult>
}

/** Erro de chamada com classificação para registro (ai_usage_logs.status) e decisão de tentar outro modelo. */
export class AIError extends Error {
  constructor(
    message: string,
    readonly kind: 'error' | 'timeout' | 'rate_limited' | 'unavailable' | 'budget',
    readonly httpStatus?: number,
  ) {
    super(message)
    this.name = 'AIError'
  }
  /** Vale a pena tentar o próximo modelo da lista? */
  get tryNext() {
    return this.kind !== 'budget'
  }
}
