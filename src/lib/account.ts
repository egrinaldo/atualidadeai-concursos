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
