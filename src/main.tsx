import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/App'
import '@/index.css'
import { promoActive } from '@/content/plans'

// Tema temporário de Black Friday: só enquanto a promoção estiver no prazo (volta sozinho ao padrão depois)
if (promoActive()) document.documentElement.classList.add('tema-black-friday')

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Elemento #root não encontrado em index.html')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
