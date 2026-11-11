import type { AuthError, Session } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'
import { touchActivity } from '@/lib/idle'

/**
 * Operações de autenticação (Supabase Auth).
 * Todas as mensagens retornadas já estão em português.
 */

export type AuthResult = { ok: true } | { ok: false; message: string; code?: string }

/** Endereço base para os links enviados por e-mail (deve estar liberado no Supabase). */
function origin(): string {
  return window.location.origin
}

export type SignUpInput = {
  fullName: string
  email: string
  password: string
  state: string
}

export type SignUpResult =
  | { ok: true; needsConfirmation: boolean }
  | { ok: false; message: string; code?: string }

export async function signUp(input: SignUpInput, captchaToken?: string | null): Promise<SignUpResult> {
  const supabase = getSupabase()
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: {
      emailRedirectTo: `${origin()}/confirmar-email`,
      ...(captchaToken ? { captchaToken } : {}),
      // Lidos pelo trigger handle_new_user para criar perfil e preferências
      data: {
        full_name: input.fullName,
        state: input.state,
        terms_accepted: true,
      },
    },
  })

  if (error) return { ok: false, message: translateAuthError(error), code: error.code }

  // E-mail já cadastrado: o Supabase devolve um usuário "fantasma" (sem
  // identidades). Respondemos igual a um cadastro novo para não revelar
  // quais e-mails têm conta (enumeração de usuários).
  if (data.session) touchActivity()
  return { ok: true, needsConfirmation: !data.session }
}

export async function signIn(email: string, password: string, captchaToken?: string | null): Promise<AuthResult> {
  const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim().toLowerCase(), password, ...(captchaToken ? { options: { captchaToken } } : {}) })
  if (!error) touchActivity() // login novo: o tempo de inatividade começa agora
  return error ? { ok: false, message: translateAuthError(error), code: error.code } : { ok: true }
}

export async function resendConfirmation(email: string, captchaToken?: string | null): Promise<AuthResult> {
  const { error } = await getSupabase().auth.resend({
    type: 'signup',
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: `${origin()}/confirmar-email`, ...(captchaToken ? { captchaToken } : {}) },
  })
  return error ? { ok: false, message: translateAuthError(error), code: error.code } : { ok: true }
}

/** Sempre responde de forma genérica para não revelar quais e-mails existem. */
export async function requestPasswordReset(email: string, captchaToken?: string | null): Promise<AuthResult> {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${origin()}/redefinir-senha`,
    ...(captchaToken ? { captchaToken } : {}),
  })
  if (error && ['over_email_send_rate_limit', 'over_request_rate_limit', 'email_address_not_authorized', 'captcha_failed'].includes(error.code ?? ''))
    return { ok: false, message: translateAuthError(error), code: error.code }
  return { ok: true }
}

export async function updatePassword(password: string): Promise<AuthResult> {
  const { error } = await getSupabase().auth.updateUser({ password })
  return error ? { ok: false, message: translateAuthError(error), code: error.code } : { ok: true }
}

/**
 * Valida o link recebido por e-mail (?token_hash=...&type=...) e cria a sessão.
 * Retorna null quando a URL não traz um link desse tipo.
 */
export async function verifyEmailLink(expected: 'email' | 'recovery'): Promise<AuthResult | null> {
  const params = new URLSearchParams(window.location.search)
  const tokenHash = params.get('token_hash')
  const type = params.get('type')
  if (!tokenHash) return null
  // Remove o token da barra de endereço/histórico antes de qualquer outra coisa
  history.replaceState(null, '', window.location.pathname)
  if (type !== expected || !/^[A-Za-z0-9_-]{10,200}$/.test(tokenHash)) {
    return { ok: false, message: 'Link inválido. Solicite um novo.' }
  }
  touchActivity() // a sessão criada pelo link começa a contar agora
  const { error } = await getSupabase().auth.verifyOtp({ token_hash: tokenHash, type: expected })
  if (!error) return { ok: true }
  if (error.code === 'otp_expired' || /expired|invalid/i.test(error.message))
    return { ok: false, code: error.code, message: 'Este link expirou ou já foi usado. Solicite um novo.' }
  return { ok: false, code: error.code, message: translateAuthError(error) }
}

export async function signOut(scope: 'global' | 'local' = 'global'): Promise<void> {
  await getSupabase().auth.signOut({ scope })
}

export async function getSession(): Promise<Session | null> {
  const { data } = await getSupabase().auth.getSession()
  return data.session
}

/**
 * Erros devolvidos pelo Supabase no endereço de retorno dos e-mails
 * (ex.: #error=access_denied&error_code=otp_expired).
 */
export function readAuthErrorFromUrl(): string | null {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, '') || window.location.search)
  const code = params.get('error_code') ?? params.get('error')
  if (!code) return null
  if (code === 'otp_expired') return 'Este link expirou ou já foi usado. Solicite um novo.'
  return params.get('error_description')?.replace(/\+/g, ' ') ?? 'Não foi possível validar o link.'
}

const messages: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada e o spam.',
  user_already_exists: 'Este e-mail já está cadastrado. Entre na sua conta ou recupere a senha.',
  email_exists: 'Este e-mail já está cadastrado. Entre na sua conta ou recupere a senha.',
  weak_password: 'Senha fraca. Use pelo menos 8 caracteres com letras e números.',
  same_password: 'A nova senha deve ser diferente da anterior.',
  email_address_invalid: 'Este e-mail não é aceito. Verifique se foi digitado corretamente.',
  email_address_not_authorized:
    'Não foi possível enviar o e-mail de confirmação para este endereço no momento. O envio de e-mails está em configuração; tente novamente mais tarde.',
  over_email_send_rate_limit: 'Muitos e-mails enviados em pouco tempo. Aguarde alguns minutos e tente novamente.',
  captcha_failed: 'A verificação anti-robô falhou ou expirou. Aguarde a caixa de verificação e tente de novo.',
  over_request_rate_limit: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.',
  signup_disabled: 'Novos cadastros estão temporariamente indisponíveis.',
  session_not_found: 'Sua sessão expirou. Entre novamente.',
  user_not_found: 'Conta não encontrada.',
  validation_failed: 'Dados inválidos. Revise os campos.',
}

export function translateAuthError(error: Pick<AuthError, 'code' | 'message' | 'status'>): string {
  if (error.code && messages[error.code]) return messages[error.code] as string
  const m = error.message ?? ''
  if (/invalid login credentials/i.test(m)) return messages.invalid_credentials as string
  if (/email not confirmed/i.test(m)) return messages.email_not_confirmed as string
  if (/already registered|already exists/i.test(m)) return messages.user_already_exists as string
  if (/rate limit/i.test(m)) return messages.over_request_rate_limit as string
  if (/password/i.test(m) && /(characters|weak|short)/i.test(m)) return messages.weak_password as string
  if (/error sending (confirmation|recovery|magic link)? ?email/i.test(m))
    return 'Não foi possível enviar o e-mail para este endereço agora. Confira se o e-mail está correto e tente novamente em alguns minutos.'
  if (/failed to fetch|network/i.test(m)) return 'Sem conexão com o servidor. Verifique sua internet e tente novamente.'
  return 'Não foi possível concluir a operação. Tente novamente em instantes.'
}
