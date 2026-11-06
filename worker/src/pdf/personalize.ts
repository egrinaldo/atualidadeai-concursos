import { PDFDocument, rgb, StandardFonts, type PDFFont } from 'pdf-lib'
import { PERSONALIZATION_SLOTS } from './template.ts'

/**
 * Personalização do PDF base: nome e e-mail do assinante na faixa reservada da capa e na metade direita do
 * rodapé de todas as páginas, mais um código da entrega nos metadados (rastreia uma cópia repassada).
 * Usa a Helvetica padrão do PDF (sem fontes extras); caracteres fora do alfabeto dela são aproximados.
 */
const MM = 72 / 25.4

export type Recipient = { name: string; email: string; code: string }

/** Deixa o texto só com caracteres que a fonte padrão consegue desenhar (acentos do português ficam). */
export function printable(text: string, font: PDFFont): string {
  let out = ''
  for (const ch of text.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f]/g, '')) {
    try {
      font.encodeText(ch)
      out += ch
    } catch {
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '')
      try {
        font.encodeText(base)
        out += base
      } catch {
        out += '?'
      }
    }
  }
  return out.replace(/\s+/g, ' ').trim()
}

/** Encurta o texto (com reticências) até caber na largura. */
function fit(text: string, font: PDFFont, size: number, width: number): string {
  if (font.widthOfTextAtSize(text, size) <= width) return text
  let t = text
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > width) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

export async function personalizePdf(base: Uint8Array, r: Recipient): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(base)
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const name = printable(r.name || r.email, bold).slice(0, 120)
  const email = printable(r.email, regular).slice(0, 254)
  const pages = pdf.getPages()

  // Capa (fundo escuro): o template já traz o rótulo "Exemplar de uso pessoal e intransferível" no topo da
  // faixa; abaixo dele vão o nome em destaque e o e-mail
  const c = PERSONALIZATION_SLOTS.cover
  const cover = pages[0]
  const cx = c.x * MM
  const cw = c.width * MM
  cover.drawText(fit(name, bold, 13, cw), { x: cx, y: (c.y + 5.5) * MM, size: 13, font: bold, color: rgb(1, 1, 1) })
  cover.drawText(fit(email, regular, 8, cw), { x: cx, y: (c.y + 1) * MM, size: 8, font: regular, color: rgb(0.8, 0.84, 0.95) })

  // Rodapé de cada página (exceto capa), alinhado à direita da metade reservada
  const f = PERSONALIZATION_SLOTS.footer
  const line = fit(`${name} · ${email}`, regular, 6.5, f.width * MM)
  const lw = regular.widthOfTextAtSize(line, 6.5)
  for (const p of pages.slice(1)) p.drawText(line, { x: (f.x + f.width) * MM - lw, y: (f.y + 1.6) * MM, size: 6.5, font: regular, color: rgb(0.42, 0.45, 0.56) })

  pdf.setSubject(`Atualidades para concursos públicos — exclusivo de ${name} <${email}>`)
  pdf.setKeywords(['atualidades', 'concursos', `entrega:${r.code}`])
  pdf.setModificationDate(new Date())
  return pdf.save()
}
