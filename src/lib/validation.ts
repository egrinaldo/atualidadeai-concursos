import { isUF } from '@/data/ufs'

/**
 * Validações dos formulários. Funções puras: retornam a mensagem de erro
 * ou `null` quando o valor é válido. O banco repete as regras essenciais
 * (restrições CHECK), então o navegador não é a única barreira.
 */

export const PASSWORD_MIN = 8

export function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function validateFullName(value: string): string | null {
  const v = normalizeSpaces(value)
  if (!v) return 'Informe seu nome completo.'
  if (v.length > 120) return 'O nome deve ter no máximo 120 caracteres.'
  if (v.split(' ').length < 2) return 'Informe nome e sobrenome.'
  if (!/^[\p{L}][\p{L}'’.\- ]+$/u.test(v)) return 'Use apenas letras no nome.'
  return null
}

export function validateEmail(value: string): string | null {
  const v = value.trim()
  if (!v) return 'Informe seu e-mail.'
  if (v.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v)) return 'Informe um e-mail válido.'
  return null
}

export function validatePassword(value: string): string | null {
  if (!value) return 'Crie uma senha.'
  if (value.length < PASSWORD_MIN) return `A senha deve ter pelo menos ${PASSWORD_MIN} caracteres.`
  if (value.length > 72) return 'A senha deve ter no máximo 72 caracteres.'
  if (!/\p{L}/u.test(value) || !/\d/.test(value)) return 'Use letras e números na senha.'
  return null
}

export function validatePasswordConfirmation(password: string, confirmation: string): string | null {
  if (!confirmation) return 'Confirme sua senha.'
  if (password !== confirmation) return 'As senhas não coincidem.'
  return null
}

export function validateUF(value: string): string | null {
  return isUF(value) ? null : 'Selecione seu estado.'
}

export function validateCity(value: string, options?: string[]): string | null {
  const v = normalizeSpaces(value)
  if (!v) return 'Informe sua cidade.'
  if (v.length > 120) return 'Nome de cidade muito longo.'
  if (options?.length && !options.some((o) => o.localeCompare(v, 'pt-BR', { sensitivity: 'base' }) === 0))
    return 'Selecione uma cidade da lista.'
  return null
}

/** Força da senha de 0 a 4 (indicador visual apenas). */
export function passwordStrength(value: string): 0 | 1 | 2 | 3 | 4 {
  let score = 0
  if (value.length >= PASSWORD_MIN) score++
  if (value.length >= 12) score++
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++
  if (/\d/.test(value) && /[^\p{L}\d]/u.test(value)) score++
  return Math.min(score, 4) as 0 | 1 | 2 | 3 | 4
}

export type FieldErrors<K extends string> = Partial<Record<K, string>>
