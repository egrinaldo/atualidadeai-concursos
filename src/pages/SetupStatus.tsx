import { useEffect, useState } from 'react'
import { Badge, Button, Container, Logo } from '@/components/ui'
import { env, isMercadoPagoConfigured, isSupabaseConfigured } from '@/config/env'
import { supabase } from '@/lib/supabase'
import { checkSupabaseConnection, type HealthResult } from '@/lib/supabaseHealth'

/**
 * PÁGINA TÉCNICA TEMPORÁRIA — Subetapa 1.
 *
 * Serve apenas para validar o ambiente (React, TypeScript, Tailwind,
 * variáveis de ambiente) e visualizar os design tokens.
 * Acessível somente em desenvolvimento: http://localhost:5173/status
 * Subetapa 3: inclui o teste real de conexão com o banco Supabase.
 */

type CheckStatus = 'ok' | 'pending'

type Check = {
  label: string
  detail: string
  status: CheckStatus
}

const checks: Check[] = [
  { label: 'React + TypeScript', detail: 'Renderizando esta página com componentes tipados.', status: 'ok' },
  {
    label: 'Tailwind CSS v4',
    detail: 'Se esta página aparece estilizada (fundo azul-marinho), está ativo.',
    status: 'ok',
  },
  {
    label: 'Supabase (variáveis públicas)',
    detail: isSupabaseConfigured
      ? `Cliente criado para ${new URL(env.supabaseUrl).host}.`
      : 'Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env.local.',
    status: isSupabaseConfigured && supabase ? 'ok' : 'pending',
  },
  {
    label: 'Mercado Pago (Public Key)',
    detail: isMercadoPagoConfigured ? 'Public Key presente.' : 'Ainda não configurado — previsto para a Subetapa 5.',
    status: isMercadoPagoConfigured ? 'ok' : 'pending',
  },
]

const swatches = [
  { name: 'navy-950', className: 'bg-navy-950' },
  { name: 'navy-800', className: 'bg-navy-800' },
  { name: 'navy-600', className: 'bg-navy-600' },
  { name: 'brand-500', className: 'bg-brand-500' },
  { name: 'brand-300', className: 'bg-brand-300' },
  { name: 'signal-400', className: 'bg-signal-400' },
]

function DatabaseCheck() {
  const [result, setResult] = useState<HealthResult | null>(null)

  useEffect(() => {
    let active = true
    checkSupabaseConnection().then((r) => active && setResult(r))
    return () => {
      active = false
    }
  }, [])

  let tone: 'success' | 'neutral' | 'warning' = 'neutral'
  let label = 'Testando…'
  let detail = 'Consultando a tabela plans com a chave pública.'

  if (result?.status === 'not-configured') {
    label = 'Pendente'
    detail = 'Configure as variáveis do Supabase para testar o banco.'
  } else if (result?.status === 'ok') {
    tone = 'success'
    label = 'OK'
    detail = result.plans.length
      ? `Conectado. Planos ativos: ${result.plans.map((p) => `${p.name} (R$ ${p.price.toFixed(2).replace('.', ',')})`).join(', ')}.`
      : 'Conectado, mas nenhum plano ativo encontrado. Execute a migração de dados iniciais.'
  } else if (result?.status === 'error') {
    tone = 'warning'
    label = 'Erro'
    detail = `${result.hint} (${result.message})`
  }

  return (
    <li className="rounded-2xl border border-white/8 bg-navy-900/70 p-5 shadow-card backdrop-blur sm:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold">Banco de dados Supabase (conexão real)</h3>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-400" data-testid="db-check">
        {detail}
      </p>
    </li>
  )
}

export function SetupStatus() {
  return (
    <div className="relative min-h-screen">
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_75%)]" />
      <div className="bg-radial-glow pointer-events-none absolute inset-0" />

      <Container as="main" className="relative py-10 sm:py-16">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Logo />
          <Badge tone="warning">Página técnica temporária</Badge>
        </header>

        <section className="mt-14 max-w-2xl animate-fade-up sm:mt-20">
          <Badge tone="signal" dot>
            Subetapa 1 · Estrutura
          </Badge>
          <h1 className="mt-5 text-4xl leading-[1.1] font-extrabold sm:text-5xl">
            Ambiente pronto para construir o <span className="text-signal-400">AtualidadeAI</span>.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-slate-400 sm:text-lg">
            Esta tela verifica a configuração do projeto. A landing page comercial será desenvolvida na Subetapa 2.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="#verificacao" size="lg">
              Ver verificação
            </Button>
            <Button href="#tokens" variant="secondary" size="lg">
              Design tokens
            </Button>
          </div>
        </section>

        <section id="verificacao" className="mt-16 scroll-mt-8 sm:mt-24">
          <h2 className="text-xl font-bold sm:text-2xl">Verificação do ambiente</h2>
          <p className="mt-1 text-sm text-slate-400">
            Modo: <code className="text-brand-300">{env.mode}</code>
          </p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {checks.map((check) => (
              <li
                key={check.label}
                className="rounded-2xl border border-white/8 bg-navy-900/70 p-5 shadow-card backdrop-blur"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-semibold">{check.label}</h3>
                  <Badge tone={check.status === 'ok' ? 'success' : 'neutral'}>
                    {check.status === 'ok' ? 'OK' : 'Pendente'}
                  </Badge>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{check.detail}</p>
              </li>
            ))}
            <DatabaseCheck />
          </ul>
        </section>

        <section id="tokens" className="mt-16 scroll-mt-8 sm:mt-24">
          <h2 className="text-xl font-bold sm:text-2xl">Design tokens</h2>
          <p className="mt-1 text-sm text-slate-400">
            Definidos em <code className="text-brand-300">src/index.css</code> (bloco <code>@theme</code>).
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {swatches.map((swatch) => (
              <div key={swatch.name} className="overflow-hidden rounded-2xl border border-white/8 bg-navy-900">
                <div className={`h-20 ${swatch.className}`} />
                <p className="px-3 py-2 font-mono text-xs text-slate-300">{swatch.name}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button>Primário</Button>
            <Button variant="secondary">Secundário</Button>
            <Button variant="ghost">Discreto</Button>
            <Badge>Marca</Badge>
            <Badge tone="signal">Sinal</Badge>
          </div>
        </section>

        <footer className="mt-20 border-t border-white/8 pt-6 text-xs text-slate-500">
          AtualidadeAI Concursos · ambiente de desenvolvimento · conteúdo técnico, não destinado ao público.
        </footer>
      </Container>
    </div>
  )
}
