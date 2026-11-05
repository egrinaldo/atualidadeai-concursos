import { Fragment, useEffect, type ReactNode } from 'react'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { Container } from '@/components/ui'
import { site } from '@/config/site'
import { LEGAL_EFFECTIVE_DATE, LEGAL_VERSION, type LegalDocument } from '@/content/legal'
import { formatBRL, plan } from '@/content/plans'

const SITE_URL = 'https://atualidadeai-concursos.vercel.app'

/** Valores dos marcadores {{...}}; vazio = ainda não informado em site.ts. */
const values: Record<string, string> = {
  empresa: site.legalName,
  email: site.contactEmail,
  emailEncarregado: site.dpoEmail || site.contactEmail,
  site: SITE_URL,
  preco: formatBRL(plan.priceCents),
}

const labels: Record<string, string> = {
  empresa: 'razão social',
  email: 'e-mail de atendimento',
  emailEncarregado: 'e-mail do encarregado',
}

/** Substitui os marcadores; campos não preenchidos aparecem destacados (nunca inventados). */
function fill(text: string): ReactNode {
  const parts = text.split(/(\{\{\w+\}\})/g)
  return parts.map((part, i) => {
    const key = part.match(/^\{\{(\w+)\}\}$/)?.[1]
    if (!key) return <Fragment key={i}>{part}</Fragment>
    const value = values[key]
    if (value) {
      return key === 'email' || key === 'emailEncarregado' ? (
        <a key={i} href={`mailto:${value}`} className="text-brand-300 underline-offset-2 hover:underline">
          {value}
        </a>
      ) : (
        <Fragment key={i}>{value}</Fragment>
      )
    }
    return (
      <mark key={i} className="rounded bg-warning-400/15 px-1 text-warning-400">
        [{labels[key] ?? key} a preencher]
      </mark>
    )
  })
}

/** Página dos documentos jurídicos (Termos de Uso e Política de Privacidade). */
export function LegalPage({ doc, related }: { doc: LegalDocument; related: { href: string; label: string } }) {
  useEffect(() => {
    document.title = `${doc.title} · AtualidadeAI Concursos`
    if (window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView()
  }, [doc.title])

  return (
    <>
      <Header />
      <main id="conteudo" className="relative pt-28 pb-20 sm:pt-32">
        <Container className="grid gap-10 lg:grid-cols-[1fr_15rem] lg:gap-14">
          <article className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-300">Documento jurídico</p>
            <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">{doc.title}</h1>
            <p className="mt-3 text-sm text-slate-400">
              Versão {LEGAL_VERSION} · Vigente desde {LEGAL_EFFECTIVE_DATE}
            </p>
            <p className="mt-6 leading-relaxed text-slate-300">{doc.intro}</p>

            <div className="mt-10 space-y-10">
              {doc.sections.map((s) => (
                <section key={s.id} id={s.id} aria-labelledby={`${s.id}-t`} className="scroll-mt-28">
                  <h2 id={`${s.id}-t`} className="font-display text-lg font-bold text-white sm:text-xl">
                    {s.title}
                  </h2>
                  <div className="mt-3 space-y-3 text-[0.95rem] leading-relaxed text-slate-300">
                    {s.blocks.map((b, i) =>
                      'p' in b ? (
                        <p key={i}>{fill(b.p)}</p>
                      ) : 'ul' in b ? (
                        <ul key={i} className="list-disc space-y-2 pl-5 marker:text-brand-400">
                          {b.ul.map((item, j) => (
                            <li key={j}>{fill(item)}</li>
                          ))}
                        </ul>
                      ) : (
                        <p key={i} className="rounded-xl border border-white/10 bg-navy-900/60 px-4 py-3 text-sm">
                          {fill(b.note)}
                        </p>
                      ),
                    )}
                  </div>
                </section>
              ))}
            </div>

            <p className="mt-12 border-t border-white/10 pt-6 text-sm text-slate-400">
              Consulte também: <a href={related.href} className="font-semibold text-brand-300 hover:text-white">{related.label}</a>
            </p>
          </article>

          <nav aria-label="Índice" className="hidden lg:block">
            <div className="sticky top-28">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Nesta página</p>
              <ol className="mt-3 space-y-2 border-l border-white/10 text-sm">
                {doc.sections.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="-ml-px block border-l border-transparent pl-3 text-slate-400 hover:border-brand-400 hover:text-white">
                      {s.title.replace(/^\d+\.\s*/, '')}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>
        </Container>
      </main>
      <Footer />
    </>
  )
}
