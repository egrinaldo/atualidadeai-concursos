import { call } from '@/lib/billing'

/** Direitos do titular (LGPD) — executados pela Edge Function "account". */

export function exportMyData() {
  return call<Record<string, unknown>>('account', { action: 'export' })
}

export function deleteMyAccount(password: string) {
  return call<{ deleted: true }>('account', { action: 'delete', password })
}

export function downloadJson(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Informativos entregues ao assinante (cópias personalizadas, disponíveis por 7 dias). */
export type MyDocument = { id: string; sent_at: string; available: boolean; edition_type: 'diaria' | 'semanal' | 'mensal'; state: string; reference_date: string; pages: number | null; size: number | null }

export function myDocuments() {
  return call<{ documents: MyDocument[] }>('account', { action: 'documents' })
}

export function myDocumentUrl(deliveryId: string) {
  return call<{ url: string; expiresIn: number }>('account', { action: 'document_url', delivery_id: deliveryId })
}
