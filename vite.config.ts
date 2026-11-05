import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Impede que uma chave SECRETA do Supabase seja embutida no JavaScript
 * público. Variáveis VITE_ vão para o navegador; se alguma contiver uma
 * chave "sb_secret_", o dev/build é interrompido antes de gerar arquivos.
 */
function jwtRole(token: string): string | null {
  if (!token.startsWith('eyJ')) return null
  try {
    return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()).role ?? null
  } catch {
    return null
  }
}

function assertNoSecretsInPublicEnv(mode: string) {
  const publicEnv = loadEnv(mode, process.cwd(), 'VITE_')
  for (const [name, value] of Object.entries(publicEnv)) {
    const v = value.trim()
    if (v.startsWith('sb_secret_') || jwtRole(v) === 'service_role') {
      throw new Error(
        `[segurança] ${name} contém uma chave SECRETA do Supabase (sb_secret_... ou service_role). ` +
          'Use a Publishable key no frontend e guarde a secreta nos Secrets das Edge Functions.',
      )
    }
  }
}

// Tailwind CSS v4 é integrado via plugin oficial do Vite (@tailwindcss/vite).
// Isso dispensa PostCSS, conforme diretriz do projeto.
export default defineConfig(({ mode }) => {
  assertNoSecretsInPublicEnv(mode)

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      strictPort: false,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      target: 'es2022',
    },
  }
})
