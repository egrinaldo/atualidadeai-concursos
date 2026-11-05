import { lazy, Suspense, type ReactNode } from 'react'
import { isSupabaseConfigured } from '@/config/env'
import { ComingSoon } from '@/pages/ComingSoon'
import { Home } from '@/pages/Home'

/**
 * Seleção de página pelo caminho da URL.
 *
 * Roteamento mínimo, sem dependência externa: cada endereço é uma página
 * completa e a navegação usa links comuns (<a href>). Atende às páginas
 * da Etapa 1 sem adicionar bibliotecas.
 */

// Páginas de conta e página técnica: carregadas sob demanda, para que a
// landing não baixe o código do Supabase.
const auth = () => import('@/pages/auth')
const Cadastro = lazy(() => auth().then((m) => ({ default: m.Cadastro })))
const Entrar = lazy(() => auth().then((m) => ({ default: m.Entrar })))
const RecuperarSenha = lazy(() => auth().then((m) => ({ default: m.RecuperarSenha })))
const RedefinirSenha = lazy(() => auth().then((m) => ({ default: m.RedefinirSenha })))
const ConfirmarEmail = lazy(() => auth().then((m) => ({ default: m.ConfirmarEmail })))
const Conta = lazy(() => auth().then((m) => ({ default: m.Conta })))
const PagamentoRetorno = lazy(() => auth().then((m) => ({ default: m.PagamentoRetorno })))
// Painel administrativo: pacote separado, baixado só por quem acessa /admin
const Admin = lazy(() => import('@/pages/admin').then((m) => ({ default: m.Admin })))
const SetupStatus = lazy(() => import('@/pages/SetupStatus').then((m) => ({ default: m.SetupStatus })))

function normalize(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, '') : path
}

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Carregando">
      <span className="size-8 animate-spin rounded-full border-2 border-brand-400/30 border-t-brand-400" />
    </div>
  )
}

const authRoutes: Record<string, () => ReactNode> = {
  '/cadastro': () => <Cadastro />,
  '/entrar': () => <Entrar />,
  '/recuperar-senha': () => <RecuperarSenha />,
  '/redefinir-senha': () => <RedefinirSenha />,
  '/confirmar-email': () => <ConfirmarEmail />,
  '/conta': () => <Conta />,
  // Retorno do checkout: o status exibido vem sempre da API do Mercado Pago
  '/pagamento/retorno': () => <PagamentoRetorno />,
  '/pagamento/sucesso': () => <PagamentoRetorno />,
  '/pagamento/pendente': () => <PagamentoRetorno />,
  '/pagamento/falha': () => <PagamentoRetorno />,
  // Acesso conferido no servidor (Edge Function "admin")
  '/admin': () => <Admin />,
}

export default function App() {
  const path = normalize(window.location.pathname)

  if (path === '/') return <Home />

  const authPage = authRoutes[path]
  if (authPage) {
    if (!isSupabaseConfigured) {
      return (
        <ComingSoon
          title="Indisponível no momento"
          stage="configuração pendente"
          description="O cadastro e o acesso de assinantes estão temporariamente indisponíveis."
        />
      )
    }
    return <Suspense fallback={<Loading />}>{authPage()}</Suspense>
  }

  switch (path) {
    case '/termos':
      return (
        <ComingSoon
          title="Termos de Uso"
          stage="documento em elaboração"
          description="Os Termos de Uso serão publicados antes do início das vendas."
        />
      )
    case '/privacidade':
      return (
        <ComingSoon
          title="Política de Privacidade"
          stage="documento em elaboração"
          description="A Política de Privacidade será publicada antes do início das vendas."
        />
      )
    case '/status':
      if (import.meta.env.DEV) {
        return (
          <Suspense fallback={<Loading />}>
            <SetupStatus />
          </Suspense>
        )
      }
      break
  }

  return <ComingSoon title="Página não encontrada" description="O endereço acessado não existe ou foi movido." />
}
