import { Container, Logo } from '@/components/ui'
import { site } from '@/config/site'
import { navLinks } from '@/content/landing'

const legalLinks = [
  { label: 'Termos de Uso', href: '/termos' },
  { label: 'Política de Privacidade', href: '/privacidade' },
]

/** Rodapé institucional. Dados legais só aparecem quando preenchidos em config/site.ts. */
export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-white/8 bg-navy-950">
      <Container className="grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">{site.tagline}</p>
          {site.contactEmail && (
            <a href={`mailto:${site.contactEmail}`} className="mt-4 inline-block text-sm text-brand-300 hover:text-white">
              {site.contactEmail}
            </a>
          )}
        </div>

        <nav aria-label="Rodapé">
          <h2 className="text-sm font-semibold text-white">Navegação</h2>
          <ul className="mt-4 space-y-3">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a href={`/${link.href}`} className="text-sm text-slate-400 hover:text-white">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="text-sm font-semibold text-white">Institucional</h2>
          <ul className="mt-4 space-y-3">
            {legalLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="text-sm text-slate-400 hover:text-white">
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <a href="/entrar" className="text-sm text-slate-400 hover:text-white">
                Área do assinante
              </a>
            </li>
          </ul>
        </div>
      </Container>

      <div className="border-t border-white/8">
        <Container className="flex flex-col gap-2 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {site.legalName || site.name}. Todos os direitos reservados.
            {site.cnpj && <> · CNPJ {site.cnpj}</>}
          </p>
          <p>Pagamentos processados pelo Mercado Pago.</p>
        </Container>
      </div>
    </footer>
  )
}
