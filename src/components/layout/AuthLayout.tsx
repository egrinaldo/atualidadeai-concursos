import { useEffect, type ReactNode } from 'react'
import { Container, Logo } from '@/components/ui'
import { cn } from '@/utils/cn'

type AuthLayoutProps = {
  title: string
  subtitle?: ReactNode
  /** Conteúdo exibido ao lado do formulário em telas grandes. */
  aside?: ReactNode
  children: ReactNode
  wide?: boolean
}

/** Layout das páginas de conta: cabeçalho enxuto + cartão central. */
export function AuthLayout({ title, subtitle, aside, children, wide = false }: AuthLayoutProps) {
  useEffect(() => {
    document.title = `${title} · AtualidadeAI Concursos`
  }, [title])

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_25%,transparent_70%)]" />
      <div className="bg-radial-glow pointer-events-none absolute inset-0" />

      <header className="relative">
        <Container className="flex h-16 items-center justify-between lg:h-20">
          <a href="/" aria-label="AtualidadeAI Concursos — início">
            <Logo />
          </a>
          <a href="/" className="text-sm font-medium text-slate-400 hover:text-white">
            ← Voltar ao site
          </a>
        </Container>
      </header>

      <main id="conteudo" className="relative flex flex-1 items-start justify-center py-8 sm:items-center sm:py-12">
        <Container className={cn('grid gap-10', Boolean(aside) && 'lg:grid-cols-[1fr_0.85fr] lg:items-center lg:gap-16', wide ? 'max-w-5xl' : aside ? 'max-w-5xl' : 'max-w-lg')}>
          <div className="w-full animate-fade-up rounded-3xl border border-white/10 bg-navy-900/85 p-6 shadow-card backdrop-blur sm:p-8">
            <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
            {subtitle && <div className="mt-2 text-sm leading-relaxed text-slate-400">{subtitle}</div>}
            <div className="mt-7">{children}</div>
          </div>
          {aside && <aside className="hidden lg:block">{aside}</aside>}
        </Container>
      </main>

      <footer className="relative py-6 text-center text-xs text-slate-500">
        <a href="/termos" className="hover:text-slate-300">
          Termos de Uso
        </a>
        <span className="mx-2">·</span>
        <a href="/privacidade" className="hover:text-slate-300">
          Política de Privacidade
        </a>
      </footer>
    </div>
  )
}
