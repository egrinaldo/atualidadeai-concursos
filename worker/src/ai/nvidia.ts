import { AIError, type AIProvider, type ChatRequest, type ChatResult } from './types.ts'

/**
 * Ajustes por modelo (verificados na conta em 05/11/2026): alguns modelos "pensam em voz alta"
 * e precisam ter o modo de raciocínio desligado para devolver só a resposta.
 */
const NO_THINKING = { chat_template_kwargs: { enable_thinking: false } }
const MODEL_OPTIONS: Record<string, Record<string, unknown>> = {
  'nvidia/nemotron-3.5-lightning-30b-a3b': NO_THINKING,
  'nvidia/nemotron-3-ultra-550b-a55b': NO_THINKING,
}

/** Remove blocos de raciocínio (<think>…</think>) que alguns modelos incluem na resposta. */
export function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '').trim()
}

/** NVIDIA NIM (API compatível com OpenAI). Usada apenas no backend (worker); a chave nunca vai ao navegador. */
export function nvidiaProvider(opts: { apiKey: string; baseUrl: string; fetchImpl?: typeof fetch }): AIProvider {
  const doFetch = opts.fetchImpl ?? fetch
  return {
    name: 'nvidia',
    async chat(model: string, req: ChatRequest): Promise<ChatResult> {
      const started = Date.now()
      let res: Response
      try {
        res = await doFetch(`${opts.baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          signal: AbortSignal.timeout(req.timeoutMs ?? 120_000),
          headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ model, messages: req.messages, max_tokens: req.maxTokens, temperature: req.temperature ?? 0.2, stream: false, ...(MODEL_OPTIONS[model] ?? {}) }),
        })
      } catch (e) {
        const name = (e as Error).name
        throw new AIError(`falha de rede (${name})`, name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'error')
      }
      const raw = await res.text()
      if (!res.ok) {
        // Corpo de erro pode ecoar dados da requisição: guarda só um trecho curto
        const detail = raw.slice(0, 200).replace(/\s+/g, ' ')
        const kind = res.status === 429 ? 'rate_limited' : res.status === 404 || res.status === 410 ? 'unavailable' : res.status === 408 || res.status === 504 ? 'timeout' : 'error'
        throw new AIError(`HTTP ${res.status}: ${detail}`, kind, res.status)
      }
      let json: { choices?: { message?: { content?: string | null }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }; model?: string }
      try {
        json = JSON.parse(raw)
      } catch {
        throw new AIError('resposta não é JSON', 'error', res.status)
      }
      const text = stripReasoning(json.choices?.[0]?.message?.content ?? '')
      const finish = json.choices?.[0]?.finish_reason
      if (!text) throw new AIError(finish === 'length' ? 'resposta vazia: limite de tokens consumido (raciocínio do modelo)' : 'resposta vazia', 'error', res.status)
      if (finish === 'length') throw new AIError('resposta cortada pelo limite de tokens', 'error', res.status)
      return {
        text,
        provider: 'nvidia',
        model,
        usage: { prompt: json.usage?.prompt_tokens ?? null, completion: json.usage?.completion_tokens ?? null, total: json.usage?.total_tokens ?? null },
        latencyMs: Date.now() - started,
      }
    },
  }
}
