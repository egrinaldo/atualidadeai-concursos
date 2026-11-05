import { z } from 'zod'

/**
 * Configuração do worker, lida das variáveis de ambiente.
 * Em caso de erro, informa apenas os NOMES das variáveis — nunca os valores.
 */
const schema = z.object({
  SUPABASE_URL: z.string().url().refine((v) => v.startsWith('https://'), 'deve começar com https://'),
  // Chave secreta dedicada ao worker (sb_secret_...) ou a service_role legada
  SUPABASE_SECRET_KEY: z.string().min(20),
  NVIDIA_API_KEY: z.string().startsWith('nvapi-').optional(),
  NVIDIA_BASE_URL: z.string().url().default('https://integrate.api.nvidia.com/v1'),
  NVIDIA_MODEL: z.string().optional(),
  WORKER_ID: z.string().min(1).max(100).optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
})

export type Config = z.infer<typeof schema> & { workerId: string }

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const input = {
    ...env,
    SUPABASE_URL: env.SUPABASE_URL ?? env.VITE_SUPABASE_URL,
    SUPABASE_SECRET_KEY: env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY,
    NVIDIA_MODEL: env.NVIDIA_MODEL || undefined,
    NVIDIA_API_KEY: env.NVIDIA_API_KEY || undefined,
  }
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => i.path.join('.')))]
    throw new Error(`Configuração inválida ou ausente: ${fields.join(', ')}`)
  }
  const workerId = parsed.data.WORKER_ID ?? (env.GITHUB_RUN_ID ? `gha-${env.GITHUB_RUN_ID}` : `local-${process.pid}`)
  return { ...parsed.data, workerId }
}
