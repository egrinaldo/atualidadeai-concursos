import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument } from 'pdf-lib'
import { EDITION_LABELS, type EditionDoc } from './model.ts'
import { bodyHtml, coverHtml, dateShort, fontFaces, headerFooter } from './template.ts'

const FONTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../assets/fonts')

/** Fontes Sora e Manrope (OFL) embutidas como data URL: a geração não depende de rede. */
export function loadFontFaces(dir = FONTS_DIR): string {
  const manifest = JSON.parse(readFileSync(join(dir, 'fonts.json'), 'utf8')) as { family: string; weight: number; subset: string; file: string; unicodeRange: string }[]
  const unique = new Map<string, (typeof manifest)[number]>()
  for (const f of manifest) unique.set(`${f.family}|${f.subset}`, f) // variável: um arquivo por alfabeto cobre todos os pesos
  return fontFaces([...unique.values()].map((f) => ({ ...f, dataUrl: `data:font/woff2;base64,${readFileSync(join(dir, f.file)).toString('base64')}` })))
}

type Browser = { newPage(): Promise<Page>; close(): Promise<void> }
type Page = {
  setContent(html: string, opts: { waitUntil: 'load' }): Promise<void>
  evaluate<T>(fn: () => T | Promise<T>): Promise<T>
  pdf(opts: Record<string, unknown>): Promise<Buffer>
  close(): Promise<void>
}

async function launch(): Promise<Browser> {
  const { chromium } = await import('playwright')
  return (await chromium.launch()) as unknown as Browser
}

async function htmlToPdf(browser: Browser, html: string, opts: Record<string, unknown>): Promise<Buffer> {
  const page = await browser.newPage()
  try {
    await page.setContent(html, { waitUntil: 'load' })
    // Espera as fontes embutidas carregarem antes de imprimir (código executado no navegador)
    await page.evaluate(() => (globalThis as unknown as { document: { fonts: { ready: Promise<unknown> } } }).document.fonts.ready.then(() => true))
    return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, ...opts })
  } finally {
    await page.close()
  }
}

/** Gera o PDF base da edição (sem dados do assinante). */
export async function renderEditionPdf(doc: EditionDoc, opts: { browser?: Browser } = {}): Promise<{ bytes: Uint8Array; pageCount: number; html: { cover: string; body: string } }> {
  const faces = loadFontFaces()
  const cover = coverHtml(doc, faces)
  const body = bodyHtml(doc, faces)
  const browser = opts.browser ?? (await launch())
  try {
    const coverPdf = await htmlToPdf(browser, cover, {})
    const bodyPdf = await htmlToPdf(browser, body, { displayHeaderFooter: true, ...headerFooter(doc) })
    const out = await PDFDocument.create()
    for (const src of [coverPdf, bodyPdf]) {
      const d = await PDFDocument.load(src)
      for (const p of await out.copyPages(d, d.getPageIndices())) out.addPage(p)
    }
    const title = `${EDITION_LABELS[doc.type]} — ${doc.stateName} — ${dateShort(doc.referenceDate)}`
    out.setTitle(title)
    out.setAuthor('AtualidadeAI Concursos')
    out.setSubject('Atualidades para concursos públicos')
    out.setKeywords(['atualidades', 'concursos', doc.state, doc.type, doc.templateVersion])
    out.setCreator(`AtualidadeAI Concursos (${doc.templateVersion})`)
    out.setProducer('AtualidadeAI Concursos')
    out.setLanguage('pt-BR')
    out.setCreationDate(new Date())
    const bytes = await out.save()
    return { bytes, pageCount: out.getPageCount(), html: { cover, body } }
  } finally {
    if (!opts.browser) await browser.close()
  }
}
