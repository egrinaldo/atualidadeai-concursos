import { createHash } from 'node:crypto'
import type { JobContext } from '../jobs/types.ts'

export type Subscriber = { id: string; name: string; email: string; state: string | null }

/** Assinantes com assinatura ATIVA (a mesma regra de acesso da área do assinante). */
export async function activeSubscribers(ctx: JobContext): Promise<Subscriber[]> {
  const { data: subs, error } = await ctx.db.from('subscriptions').select('user_id').eq('status', 'active').limit(10000)
  if (error) throw new Error(`assinaturas: ${error.message}`)
  const ids = [...new Set((subs ?? []).map((s) => s.user_id as string))]
  const out: Subscriber[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error: e2 } = await ctx.db.from('profiles').select('id, full_name, email, state').in('id', ids.slice(i, i + 200))
    if (e2) throw new Error(`perfis: ${e2.message}`)
    for (const p of data ?? []) if (p.email) out.push({ id: p.id, name: p.full_name ?? '', email: p.email, state: p.state ?? null })
  }
  return out
}

/** Caminho da cópia personalizada: sem nome/e-mail no caminho; a pasta por usuário facilita apagar tudo dele. */
export const personalizedPath = (userId: string, documentId: string) => `personalizados/${userId}/${documentId}.pdf`

/** Código curto da entrega gravado nos metadados do PDF (identifica a cópia sem expor dados). */
export const deliveryCode = (documentId: string, userId: string) => createHash('sha256').update(`${documentId}:${userId}`).digest('hex').slice(0, 12)

/** Documento atual de uma edição: a versão mais nova aprovada no controle de qualidade. */
export async function currentDocument(ctx: JobContext, editionId: string) {
  const { data, error } = await ctx.db
    .from('generated_documents')
    .select('id, version, storage_path, status, qa_status')
    .eq('edition_id', editionId)
    .eq('qa_status', 'passed')
    .in('status', ['generated', 'approved', 'published'])
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`documento: ${error.message}`)
  return data as { id: string; version: number; storage_path: string; status: string } | null
}
