import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { Benefits } from '@/components/sections/Benefits'
import { Coverage } from '@/components/sections/Coverage'
import { Faq } from '@/components/sections/Faq'
import { FinalCta } from '@/components/sections/FinalCta'
import { Hero } from '@/components/sections/Hero'
import { HowItWorks } from '@/components/sections/HowItWorks'
import { Materials } from '@/components/sections/Materials'
import { PdfDemo } from '@/components/sections/PdfDemo'
import { Pricing } from '@/components/sections/Pricing'
import { Problems } from '@/components/sections/Problems'

/** Landing page. A ordem das seções é definida aqui. */
export function Home() {
  return (
    <>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-navy-950"
      >
        Pular para o conteúdo
      </a>
      <Header />
      <main id="conteudo">
        <Hero />
        <Problems />
        <Benefits />
        <HowItWorks />
        <Coverage />
        <Materials />
        <PdfDemo />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  )
}
