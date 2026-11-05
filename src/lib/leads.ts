import { getSupabase } from '@/lib/supabase'

export type LeadInput = { name: string; email: string; state?: string; city?: string }

/**
 * Registra o interessado como lead (função capture_lead no banco).
 * Nunca interrompe o fluxo principal: falhas são apenas registradas no console.
 */
export async function captureLead(input: LeadInput): Promise<boolean> {
  try {
    const { error } = await getSupabase().rpc('capture_lead', {
      p_name: input.name,
      p_email: input.email.trim().toLowerCase(),
      p_state: input.state ?? null,
      p_city: input.city ?? null,
    })
    if (error) {
      console.warn('[lead] não registrado:', error.message)
      return false
    }
    return true
  } catch (e) {
    console.warn('[lead] falha:', e)
    return false
  }
}
