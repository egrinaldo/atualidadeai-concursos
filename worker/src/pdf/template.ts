import { EDITION_LABELS, type EditionDoc, type Item } from './model.ts'

/** Escapa texto para HTML (todo conteúdo vem do banco/IA e é tratado como não confiável). */
export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? esc(u) : '#')

/**
 * Áreas reservadas para a personalização (nome + e-mail do assinante), carimbadas depois com pdf-lib (Subetapa 2.8).
 * Medidas em milímetros a partir do canto inferior esquerdo da página A4 (210 × 297 mm).
 */
export const PERSONALIZATION_SLOTS = {
  cover: { x: 22, y: 30, width: 166, height: 16 },
  footer: { x: 105, y: 6, width: 89, height: 6 }, // metade direita do rodapé de cada página
}

const COLORS = {
  navy950: '#070b1f', navy900: '#0b1230', navy800: '#111a42', navy700: '#1a2557',
  brand500: '#3366ff', brand600: '#2450e6', brand100: '#e8eeff', brand50: '#f3f6ff',
  signal400: '#38e1ff', signal500: '#0fc4ea', signal50: '#e8fbff',
  ink: '#151a2e', muted: '#5a6178', line: '#dfe3ee',
  ok: '#0f8a5f', okBg: '#e7f7f0', info: '#2450e6', infoBg: '#e8eeff', warn: '#a15c00', warnBg: '#fff4e0',
}

export function fontFaces(fonts: { family: string; weight: number; unicodeRange: string; dataUrl: string }[]): string {
  return fonts
    .map((f) => `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.family === 'Sora' ? '600 800' : '400 700'};font-display:block;src:url(${f.dataUrl}) format('woff2');unicode-range:${f.unicodeRange};}`)
    .join('\n')
}

export function dateLong(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00-03:00`)
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(d)
}
export function dateShort(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(iso.length === 10 ? `${iso}T12:00:00-03:00` : iso))
}
const hourShort = (iso: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(iso)).replace(',', ' às')

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Manrope',sans-serif;font-weight:450;color:${COLORS.ink};font-size:10.2pt;line-height:1.55;font-feature-settings:'kern','liga'}
h1,h2,h3,h4,.display{font-family:'Sora',sans-serif;letter-spacing:-0.01em}
a{color:${COLORS.brand600};text-decoration:none}
`

export function coverHtml(doc: EditionDoc, faces: string): string {
  const total = doc.blocks.reduce((a, b) => a + b.items.length, 0)
  const questions = doc.blocks.reduce((a, b) => a + b.items.reduce((x, i) => x + i.questions.length, 0), 0)
  const label = EDITION_LABELS[doc.type]
  const toc = doc.blocks
    .filter((b) => b.items.length)
    .map(
      (b) => `<div class="toc-block"><div class="toc-head"><span>${esc(b.title)}</span><span class="toc-count">${b.items.length} ${b.items.length === 1 ? 'assunto' : 'assuntos'}</span></div>
      <ol>${b.items.map((i) => `<li><span class="num">${String(i.n).padStart(2, '0')}</span><span class="t">${esc(i.title)}</span></li>`).join('')}</ol></div>`,
    )
    .join('')
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
${faces}${BASE_CSS}
@page{size:A4;margin:0}
.cover{width:210mm;height:297mm;position:relative;overflow:hidden;color:#fff;
  background:radial-gradient(120mm 90mm at 92% 4%, rgba(56,225,255,.28), transparent 70%),
             radial-gradient(150mm 120mm at 0% 100%, rgba(51,102,255,.35), transparent 70%),
             linear-gradient(160deg, ${COLORS.navy800} 0%, ${COLORS.navy950} 70%);padding:22mm 22mm 0}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:10mm 10mm}
.brand{position:relative;display:flex;align-items:center;gap:3.2mm;font-family:'Sora';font-weight:700;font-size:12pt;letter-spacing:.01em}
.mark{width:9mm;height:9mm;border-radius:2.4mm;background:linear-gradient(135deg,${COLORS.brand500},${COLORS.signal400});display:flex;align-items:center;justify-content:center;font-size:10pt;font-weight:800;color:${COLORS.navy950}}
.brand small{display:block;font-family:'Manrope';font-weight:500;font-size:7.5pt;color:#9fb0e6;letter-spacing:.12em;text-transform:uppercase}
.kicker{position:relative;margin-top:24mm;font-size:8.5pt;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:${COLORS.signal400}}
h1{position:relative;margin-top:4mm;font-size:34pt;line-height:1.05;font-weight:800}
h1 em{font-style:normal;color:${COLORS.signal400}}
.meta{position:relative;margin-top:6mm;display:flex;gap:8mm;font-size:10pt;color:#c9d4f5}
.meta b{display:block;font-family:'Sora';font-size:8pt;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#7f91c9;margin-bottom:1mm}
.stats{position:relative;margin-top:9mm;display:flex;gap:4mm}
.stat{flex:1;border:1px solid rgba(143,179,255,.22);background:rgba(17,26,66,.55);border-radius:3mm;padding:3.5mm 4mm}
.stat .v{font-family:'Sora';font-size:18pt;font-weight:700;color:#fff;line-height:1}
.stat .l{font-size:7.8pt;color:#9fb0e6;margin-top:1.2mm}
.toc{position:relative;margin-top:9mm;display:grid;grid-template-columns:1fr;gap:4mm;max-height:112mm;overflow:hidden}
.toc-block{border-left:2px solid ${COLORS.signal400};padding-left:4mm}
.toc-head{display:flex;justify-content:space-between;align-items:baseline;font-family:'Sora';font-weight:700;font-size:10pt}
.toc-count{font-family:'Manrope';font-weight:600;font-size:7.5pt;color:#7f91c9;text-transform:uppercase;letter-spacing:.1em}
.toc ol{list-style:none;margin-top:1.5mm}
.toc li{display:flex;gap:2.5mm;font-size:8.6pt;line-height:1.35;color:#dbe3fb;margin:.9mm 0}
.toc .num{font-family:'Sora';font-weight:700;color:${COLORS.signal400};min-width:5.5mm}
.toc .t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150mm}
.personal{position:absolute;left:22mm;right:22mm;bottom:30mm;height:16mm;border-top:1px solid rgba(143,179,255,.25);padding-top:2.5mm}
.personal .l{font-size:7.2pt;letter-spacing:.16em;text-transform:uppercase;color:#7f91c9}
.foot{position:absolute;left:22mm;right:22mm;bottom:12mm;display:flex;justify-content:space-between;font-size:7.4pt;color:#7f91c9}
</style></head><body><section class="cover"><div class="grid"></div>
<div class="brand"><div class="mark">A</div><div>AtualidadeAI Concursos<small>Atualidades para concursos públicos</small></div></div>
<div class="kicker">${esc(label)} · ${esc(doc.stateName)}</div>
<h1>Atualidades que <em>caem em prova</em></h1>
<div class="meta"><div><b>Edição</b>${esc(dateLong(doc.referenceDate))}</div><div><b>Período coberto</b>${esc(hourShort(doc.periodStart))} a ${esc(hourShort(doc.periodEnd))}</div></div>
<div class="stats"><div class="stat"><div class="v">${total}</div><div class="l">assuntos selecionados</div></div>
<div class="stat"><div class="v">${questions}</div><div class="l">questões de fixação</div></div>
<div class="stat"><div class="v">3</div><div class="l">blocos: estado, Brasil e mundo</div></div></div>
<div class="toc">${toc}</div>
<div class="personal"><div class="l">Exemplar de uso pessoal e intransferível</div></div>
<div class="foot"><span>Fontes oficiais e veículos citados · texto próprio verificado</span><span>atualidadeai-concursos.vercel.app</span></div>
</section></body></html>`
}

const para = (s: string | null) => (s ? `<p>${esc(s)}</p>` : '')
const list = (xs: string[]) => (xs.length ? `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '')

function itemHtml(i: Item): string {
  const sections: string[] = []
  sections.push(`<div class="sec"><h4>O que aconteceu</h4>${para(i.whatHappened)}</div>`)
  if (i.timeline.length)
    sections.push(`<div class="sec tl"><h4>Linha do tempo</h4><ol>${i.timeline.map((t) => `<li><b>${esc(t.date)}</b><span>${esc(t.fact)}</span></li>`).join('')}</ol></div>`)
  if (i.context) sections.push(`<div class="sec"><h4>Contexto</h4>${para(i.context)}</div>`)
  if (i.background) sections.push(`<div class="sec"><h4>Antecedentes</h4>${para(i.background)}</div>`)
  for (const a of i.analyses) sections.push(`<div class="sec"><h4>${esc(a.label)}</h4>${para(a.text)}</div>`)
  sections.push(`<div class="sec"><h4>Por que importa</h4>${para(i.whyItMatters)}</div>`)
  if (i.consequences.confirmed.length || i.consequences.projections.length)
    sections.push(`<div class="sec two"><div><h4>Efeitos confirmados</h4>${list(i.consequences.confirmed) || '<p class="muted">Sem efeitos confirmados até o fechamento.</p>'}</div>
      <div><h4>Possíveis desdobramentos <span class="tag">projeção</span></h4>${list(i.consequences.projections) || '<p class="muted">—</p>'}</div></div>`)
  const exam = `<div class="exam"><div class="exam-h"><span class="ico">✦</span>Na prova</div>
    <p>${esc(i.examRelevance)}</p>
    ${i.topics.length ? `<div class="chips">${i.topics.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
    ${i.approaches.length ? `<h5>Como as bancas podem cobrar</h5>${list(i.approaches)}` : ''}</div>`
  const mem = i.memorize.length ? `<div class="memo"><div class="memo-h">Para memorizar</div>${list(i.memorize)}</div>` : ''
  const qs = i.questions
    .map(
      (q) => `<div class="q"><div class="q-h">Questão ${q.n}</div><p class="q-s">${esc(q.statement)}</p>
      <ol class="alts">${q.alternatives.map((a) => `<li><b>${esc(a.letter)})</b> ${esc(a.text)}</li>`).join('')}</ol></div>`,
    )
    .join('')
  const refs = i.references.length
    ? `<div class="refs"><span class="refs-h">Fontes</span>${i.references
        .map((r) => `<a href="${safeUrl(r.url)}">${esc(r.source)}${r.official ? ' <i>oficial</i>' : ''}</a>`)
        .join('<span class="dot">·</span>')}</div>`
    : ''
  return `<article class="item" id="item-${i.n}">
  <header class="item-h"><div class="item-n">${String(i.n).padStart(2, '0')}</div><div class="item-t">
    <div class="badges"><span class="cat">${esc(i.category)}</span><span class="ver ${i.verification.tone}">${esc(i.verification.label)}</span>${i.followUp ? `<span class="fu">${esc(i.followUp)}</span>` : ''}</div>
    <h3>${esc(i.title)}</h3></div></header>
  <p class="lead">${esc(i.summary)}</p>
  ${sections.join('')}
  ${mem}${exam}
  ${qs ? `<div class="qs">${qs}</div>` : ''}
  ${refs}
</article>`
}

export function bodyHtml(doc: EditionDoc, faces: string): string {
  const blocks = doc.blocks
    .filter((b) => b.items.length)
    .map(
      (b) => `<section class="block">
  <div class="block-h"><div class="block-k">${b.key === 'estado' ? 'Bloco 1 · Seu estado' : b.key === 'nacional' ? 'Bloco 2 · Nacional' : 'Bloco 3 · Internacional'}</div>
  <h2>${esc(b.title)}</h2><p>${esc(b.subtitle)}</p></div>
  ${b.items.map(itemHtml).join('')}
</section>`,
    )
    .join('')
  const answers = doc.blocks
    .flatMap((b) => b.items)
    .flatMap((i) => i.questions.map((q) => ({ q, i })))
    .map(({ q, i }) => `<div class="ans"><div class="ans-h"><span class="ans-n">Questão ${q.n}</span><span class="ans-k">Gabarito: ${esc(q.answer)}</span><span class="ans-t">${esc(i.title)}</span></div><p>${esc(q.comment)}</p></div>`)
    .join('')
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
${faces}${BASE_CSS}
@page{size:A4;margin:17mm 16mm 19mm 16mm}
.block-h{background:${COLORS.navy900};color:#fff;border-radius:3mm;padding:6mm 7mm;margin:0 0 6mm;position:relative;overflow:hidden;break-after:avoid}
.block-h:after{content:'';position:absolute;right:-12mm;top:-14mm;width:48mm;height:48mm;border-radius:50%;background:radial-gradient(circle,rgba(56,225,255,.35),transparent 70%)}
.block{break-before:page}
.block:first-child{break-before:auto}
.block-k{font-size:7.5pt;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:${COLORS.signal400}}
.block-h h2{font-size:22pt;font-weight:800;margin-top:1.5mm}
.block-h p{font-size:9pt;color:#c9d4f5;margin-top:1mm}
.item{padding:0 0 6mm;margin:0 0 7mm;border-bottom:1px solid ${COLORS.line}}
.item:last-child{border-bottom:0}
.item-h{display:flex;gap:4mm;align-items:flex-start;break-after:avoid;break-inside:avoid}
.item-n{font-family:'Sora';font-weight:800;font-size:20pt;line-height:1;color:${COLORS.brand500};min-width:12mm}
.badges{display:flex;flex-wrap:wrap;gap:1.6mm;margin-bottom:1.6mm}
.badges span{font-size:7pt;font-weight:700;letter-spacing:.04em;padding:.7mm 2.2mm;border-radius:10mm}
.cat{background:${COLORS.brand50};color:${COLORS.brand600};text-transform:uppercase;letter-spacing:.1em!important}
.ver.ok{background:${COLORS.okBg};color:${COLORS.ok}}.ver.info{background:${COLORS.infoBg};color:${COLORS.info}}.ver.warn{background:${COLORS.warnBg};color:${COLORS.warn}}
.item h3{font-size:14pt;line-height:1.25;font-weight:700;color:${COLORS.navy900}}
.lead{margin:3.5mm 0 3mm;font-size:10.8pt;font-weight:600;color:${COLORS.navy700};border-left:3px solid ${COLORS.signal500};padding-left:3.5mm;break-after:avoid}
.sec{margin-top:3mm}
.sec h4,.exam h5{font-size:8pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${COLORS.brand600};margin-bottom:1mm;break-after:avoid}
.sec p{text-align:justify;hyphens:auto}
.sec.two{display:grid;grid-template-columns:1fr 1fr;gap:5mm;break-inside:avoid}
.tag{font-size:6.5pt;background:${COLORS.warnBg};color:${COLORS.warn};padding:.3mm 1.5mm;border-radius:2mm;letter-spacing:.06em;margin-left:1mm}
ul{padding-left:4.2mm}li{margin:.6mm 0}
.muted{color:${COLORS.muted}}
.tl ol{list-style:none;margin:1mm 0 0;padding:0;border-left:.6mm solid ${COLORS.brand100}}.tl li{position:relative;padding:0 0 1.6mm 4mm}.tl li:before{content:'';position:absolute;left:-1.35mm;top:1.3mm;width:2.1mm;height:2.1mm;border-radius:50%;background:${COLORS.brand600}}.tl b{display:inline-block;min-width:11mm;font-family:'Sora';font-size:8.5pt;color:${COLORS.brand600}}.tl span{font-size:9.5pt}
.fu{font-size:7pt;font-weight:600;padding:.6mm 2mm;border-radius:9mm;background:${COLORS.signal50};color:#05677c}
.memo{margin-top:4mm;background:${COLORS.signal50};border:1px solid #b9eefb;border-radius:2.5mm;padding:3.5mm 4.5mm;break-inside:avoid}
.memo-h{font-family:'Sora';font-weight:700;font-size:9pt;color:#05677c;margin-bottom:1mm}
.exam{margin-top:3.5mm;background:${COLORS.brand50};border-radius:2.5mm;padding:3.5mm 4.5mm;break-inside:avoid}
.exam-h{font-family:'Sora';font-weight:700;font-size:9pt;color:${COLORS.navy800};margin-bottom:1mm}
.exam-h .ico{color:${COLORS.brand500};margin-right:1.5mm}
.exam h5{margin-top:2.5mm}
.chips{display:flex;flex-wrap:wrap;gap:1.5mm;margin-top:2mm}
.chips span{font-size:7.5pt;font-weight:600;background:#fff;border:1px solid #c9d6ff;color:${COLORS.navy700};padding:.5mm 2.2mm;border-radius:10mm}
.qs{margin-top:4mm}
.q{border:1px solid ${COLORS.line};border-radius:2.5mm;padding:3.5mm 4.5mm;margin-top:2.5mm;break-inside:avoid}
.q-h{font-family:'Sora';font-weight:700;font-size:8.5pt;color:${COLORS.brand600};margin-bottom:1mm}
.q-s{font-weight:600}
.alts{list-style:none;margin-top:1.5mm}.alts li{margin:.8mm 0;padding-left:5mm;text-indent:-5mm}
.refs{margin-top:3.5mm;font-size:8pt;color:${COLORS.muted};line-height:1.7}
.refs-h{font-weight:700;color:${COLORS.navy700};margin-right:2mm;text-transform:uppercase;letter-spacing:.1em;font-size:7pt}
.refs i{font-style:normal;font-size:6.5pt;font-weight:700;color:${COLORS.ok};background:${COLORS.okBg};padding:.2mm 1.2mm;border-radius:1.5mm}
.dot{margin:0 1.6mm;color:#b0b6c8}
.answers{break-before:page}
.answers h2,.about h2{font-size:18pt;font-weight:800;color:${COLORS.navy900};margin-bottom:1mm}
.answers>p,.about>p{color:${COLORS.muted};margin-bottom:4mm}
.ans{padding:2.6mm 0;border-bottom:1px solid ${COLORS.line};break-inside:avoid}
.ans-h{display:flex;gap:3mm;align-items:baseline;font-size:8.5pt}
.ans-n{font-family:'Sora';font-weight:700;color:${COLORS.brand600}}
.ans-k{font-weight:800;color:${COLORS.ok}}
.ans-t{color:${COLORS.muted};overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:120mm}
.ans p{margin-top:1mm}
.about{margin-top:10mm;break-inside:avoid;background:${COLORS.brand50};border-radius:3mm;padding:6mm 7mm}
.about h2{font-size:12pt}
.about p{font-size:8.6pt;margin-top:1.5mm}
</style></head><body>
${blocks}
<section class="answers"><h2>Gabarito comentado</h2><p>Resolva as questões antes de conferir. O comentário explica por que a alternativa está correta.</p>${answers}
<div class="about"><h2>Como este material é feito</h2>
<p>Os assuntos são coletados de fontes oficiais (órgãos públicos, tribunais, IBGE, Banco Central, ONU e outros) e de veículos de imprensa citados em cada matéria. Cada fato passa por verificação cruzada entre fontes independentes; o selo de cada assunto indica o resultado.</p>
<p>Os textos são redigidos por inteligência artificial a partir somente dessas fontes, conferidos automaticamente (números, nomes e ausência de cópia) e sujeitos a revisão editorial. Não reproduzimos o texto dos veículos: consulte as fontes indicadas para a íntegra.</p>
<p>Material de estudo de uso pessoal e intransferível. Não constitui orientação jurídica. Dúvidas ou correções: atualidadeaiconcursos@gmail.com.</p></div>
</section>
</body></html>`
}

/** Cabeçalho e rodapé das páginas do miolo (o Chromium não aplica @font-face aqui: fontes do sistema). */
export function headerFooter(doc: EditionDoc) {
  const style = 'font-family:Helvetica,Arial,sans-serif;font-size:7px;color:#6b7390;width:100%;padding:0 16mm;display:flex;justify-content:space-between;'
  return {
    headerTemplate: `<div style="${style}padding-top:6mm"><span style="font-weight:700;color:#1a2557">AtualidadeAI Concursos</span><span>${esc(EDITION_LABELS[doc.type])} · ${esc(doc.stateName)} · ${esc(dateShort(doc.referenceDate))}</span></div>`,
    // A metade direita fica livre para a personalização (nome e e-mail) — ver PERSONALIZATION_SLOTS.footer
    footerTemplate: `<div style="${style}padding-bottom:6mm"><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span><span></span></div>`,
  }
}
