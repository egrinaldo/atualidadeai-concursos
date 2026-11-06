import { PDFDocument } from 'pdf-lib'
import type { EditionDoc } from './model.ts'

export const QA_LIMITS = { maxBytes: 20 * 1024 * 1024, minPages: 2, maxPages: 160, minItems: 3 }
const CONTACT = 'atualidadeaiconcursos@gmail.com'

export type QaReport = { passed: boolean; errors: string[]; warnings: string[]; stats: Record<string, number> }

/**
 * Controle de qualidade do PDF base antes de publicar: conteúdo mínimo, nenhum texto quebrado
 * ("undefined", "null"…), fontes com link válido, nenhum dado pessoal, arquivo íntegro e dentro dos limites.
 */
export async function qaEdition(doc: EditionDoc, html: { cover: string; body: string }, bytes: Uint8Array): Promise<QaReport> {
  const errors: string[] = []
  const warnings: string[] = []
  const items = doc.blocks.flatMap((b) => b.items)
  if (items.length < QA_LIMITS.minItems) errors.push(`poucos assuntos: ${items.length} (mínimo ${QA_LIMITS.minItems})`)
  for (const b of doc.blocks) if (!b.items.length) warnings.push(`bloco "${b.title}" sem assuntos`)
  for (const i of items) {
    if (!i.references.length) errors.push(`assunto ${i.n} sem fonte`)
    if (i.references.some((r) => !/^https?:\/\//.test(r.url))) errors.push(`assunto ${i.n} com link inválido`)
    if (!i.questions.length) warnings.push(`assunto ${i.n} sem questões`)
    if (i.verification.tone === 'warn') warnings.push(`assunto ${i.n} de fonte única`)
    // Trava final: nada sem auditoria de veracidade aprovada (ou dispensada pelo editor) vai para o PDF
    if (i.audit !== 'aprovada' && i.audit !== 'dispensada') errors.push(`assunto ${i.n} sem auditoria de veracidade aprovada (${i.audit})`)
  }
  const visible = (h: string) => h.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')
  const text = visible(html.cover) + ' ' + visible(html.body)
  const broken = text.match(/\b(undefined|null|NaN|\[object Object\])\b/g)
  if (broken) errors.push(`texto quebrado no documento: ${[...new Set(broken)].join(', ')}`)
  const emails = (text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? []).map((e) => e.replace(/\.+$/, '').toLowerCase()).filter((e) => e !== CONTACT)
  if (emails.length) errors.push('dado pessoal (e-mail) no PDF base') // a personalização só entra na cópia do assinante

  let pages = 0
  try {
    const pdf = await PDFDocument.load(bytes)
    pages = pdf.getPageCount()
    if (!pdf.getTitle()) warnings.push('PDF sem título nos metadados')
  } catch (e) {
    errors.push(`PDF ilegível: ${(e as Error).message}`)
  }
  if (bytes.length > QA_LIMITS.maxBytes) errors.push(`arquivo grande demais: ${(bytes.length / 1048576).toFixed(1)} MB`)
  if (pages && (pages < QA_LIMITS.minPages || pages > QA_LIMITS.maxPages)) errors.push(`número de páginas fora do esperado: ${pages}`)
  return {
    passed: errors.length === 0,
    errors,
    warnings,
    stats: { items: items.length, questions: items.reduce((a, i) => a + i.questions.length, 0), pages, bytes: bytes.length },
  }
}
