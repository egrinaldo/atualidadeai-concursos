import { useEffect } from 'react'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { Badge, Button, Container, Icon } from '@/components/ui'

type ComingSoonProps = {
  title: string
  description: string
  /** Rótulo informativo, ex.: "Subetapa 4". */
  stage?: string
}

/**
 * Página provisória para rotas que ainda serão implementadas
 * (cadastro, login, termos, privacidade) e para endereços inexistentes.
 * Evita links quebrados enquanto as próximas subetapas não chegam.
 */
export function ComingSoon({ title, description, stage }: ComingSoonProps) {
  useEffect(() => {
    document.title = `${title} · AtualidadeAI Concursos`
  }, [title])

  return (
    <>
      <Header />
      <main className="relative flex min-h-[80vh] items-center overflow-hidden pt-24">
        <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
        <Container className="relative py-20 text-center">
          {stage && (
            <Badge tone="warning" className="mx-auto">
              Em construção · {stage}
            </Badge>
          )}
          <h1 className="mt-6 text-3xl font-extrabold sm:text-5xl">{title}</h1>
          <p className="mx-auto mt-4 max-w-lg text-slate-400">{description}</p>
          <div className="mt-8 flex justify-center">
            <Button href="/" variant="secondary">
              <Icon name="arrowRight" className="size-4 rotate-180" />
              Voltar para o início
            </Button>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  )
}
