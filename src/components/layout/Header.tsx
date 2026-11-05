import { useEffect, useState } from 'react'
import { Button, Container, Icon, Logo } from '@/components/ui'
import { navLinks } from '@/content/landing'
import { cn } from '@/utils/cn'

/**
 * Cabeçalho fixo com navegação por âncoras.
 * Os links usam "/#secao" para funcionar também a partir de outras páginas.
 */
export function Header() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const close = () => setOpen(false)

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-colors duration-300',
        scrolled || open ? 'border-b border-white/8 bg-navy-950/85 backdrop-blur-lg' : 'bg-transparent',
      )}
    >
      <Container className="flex h-16 items-center justify-between gap-6 lg:h-20">
        <a href="/" aria-label="AtualidadeAI Concursos — início" onClick={close}>
          <Logo />
        </a>

        <nav aria-label="Principal" className="hidden lg:block">
          <ul className="flex items-center gap-8">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={`/${link.href}`}
                  className="text-sm font-medium text-slate-300 transition-colors hover:text-white"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Button href="/entrar" variant="ghost" size="sm">
            Entrar
          </Button>
          <Button href="/#planos" size="sm">
            Assinar agora
          </Button>
        </div>

        <button
          type="button"
          className="-mr-2 inline-flex size-11 items-center justify-center rounded-xl text-slate-200 hover:bg-white/5 lg:hidden"
          aria-expanded={open}
          aria-controls="menu-mobile"
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name={open ? 'close' : 'menu'} className="size-6" />
        </button>
      </Container>

      <div id="menu-mobile" hidden={!open} className="border-t border-white/8 lg:hidden">
        <Container className="py-4">
          <ul className="flex flex-col">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={`/${link.href}`}
                  onClick={close}
                  className="block rounded-lg px-2 py-3 text-base font-medium text-slate-200 hover:bg-white/5"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/8 pt-4">
            <Button href="/entrar" variant="secondary" onClick={close}>
              Entrar
            </Button>
            <Button href="/#planos" onClick={close}>
              Assinar agora
            </Button>
          </div>
        </Container>
      </div>
    </header>
  )
}
