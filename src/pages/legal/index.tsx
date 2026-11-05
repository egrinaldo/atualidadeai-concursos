import { privacyPolicy, termsOfUse } from '@/content/legal'
import { LegalPage } from './LegalPage'

export function Termos() {
  return <LegalPage doc={termsOfUse} related={{ href: '/privacidade', label: 'Política de Privacidade' }} />
}

export function Privacidade() {
  return <LegalPage doc={privacyPolicy} related={{ href: '/termos', label: 'Termos de Uso' }} />
}
