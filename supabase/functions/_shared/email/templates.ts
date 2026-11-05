/**
 * Modelos de e-mail do AtualidadeAI Concursos.
 *
 * - HTML em tabelas com estilos inline (compatível com Gmail, Outlook, Apple Mail).
 * - Sempre acompanhado de versão em texto simples.
 * - Funções puras, sem dependências (testáveis no Deno/Node).
 *
 * Para mudar textos: edite os objetos em `transactional` e `auth` abaixo.
 */

export type TransactionalKind =
  | 'assinatura_ativada' // Confirmação de contratação
  | 'orientacoes_iniciais'
  | 'pagamento_aprovado'
  | 'pagamento_pendente'
  | 'pagamento_recusado'

export type EmailData = {
  name?: string | null
  amount?: number | null
  nextPaymentDate?: string | null
  siteUrl: string
}

export type RenderedEmail = { subject: string; html: string; text: string }

const BRAND = {
  navy: '#0B1230',
  blue: '#3366FF',
  signal: '#0FC4EA',
  text: '#1F2937',
  muted: '#6B7280',
  bg: '#F3F5FB',
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

export function formatBRL(value: number | null | undefined): string {
  if (value == null) return ''
  return 'R$ ' + value.toFixed(2).replace('.', ',')
}

export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  return `${d.getUTCDate()} de ${meses[d.getUTCMonth()]} de ${d.getUTCFullYear()}`
}

function firstName(name?: string | null): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? ''
}

type Block = { paragraphs: string[]; list?: string[]; cta?: { label: string; url: string }; note?: string }

/** Layout base. `raw` = valores já seguros (ex.: variáveis {{ .ConfirmationURL }} do Supabase). */
export function layout(opts: { preheader: string; title: string; block: Block; raw?: boolean }): string {
  const e = opts.raw ? (s: string) => s : escapeHtml
  const p = opts.block.paragraphs
    .map((t) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${BRAND.text};">${e(t)}</p>`)
    .join('')
  const list = opts.block.list?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">${opts.block.list
        .map(
          (i) =>
            `<tr><td style="vertical-align:top;padding:4px 10px 4px 0;color:${BRAND.signal};font-size:16px;">&#10003;</td><td style="padding:4px 0;font-size:15px;line-height:1.5;color:${BRAND.text};">${e(i)}</td></tr>`,
        )
        .join('')}</table>`
    : ''
  const cta = opts.block.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="border-radius:10px;background:${BRAND.blue};">
<a href="${opts.raw ? opts.block.cta.url : escapeHtml(opts.block.cta.url)}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${e(opts.block.cta.label)}</a>
</td></tr></table>`
    : ''
  const note = opts.block.note ? `<p style="margin:0;font-size:13px;line-height:1.5;color:${BRAND.muted};">${e(opts.block.note)}</p>` : ''

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(opts.title)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:Arial,Helvetica,sans-serif;">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${e(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
<tr><td style="background:${BRAND.navy};padding:22px 28px;">
<span style="font-size:20px;font-weight:800;color:#ffffff;">Atualidade<span style="color:#5B8CFF;">AI</span></span>
<span style="display:block;font-size:11px;letter-spacing:3px;color:#94A3B8;margin-top:2px;">CONCURSOS</span>
</td></tr>
<tr><td style="padding:30px 28px 26px;">
<h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:${BRAND.navy};">${e(opts.title)}</h1>
${p}${list}${cta}${note}
</td></tr>
<tr><td style="padding:18px 28px;background:#F8FAFC;border-top:1px solid #E5E7EB;font-size:12px;line-height:1.5;color:${BRAND.muted};">
Você recebeu este e-mail por ter uma conta no AtualidadeAI Concursos.<br>Pagamentos processados pelo Mercado Pago.
</td></tr>
</table>
</td></tr></table>
</body></html>`
}

function toText(title: string, block: Block): string {
  return [
    title,
    '',
    ...block.paragraphs.flatMap((p) => [p, '']),
    ...(block.list ?? []).map((i) => `- ${i}`),
    block.list?.length ? '' : null,
    block.cta ? `${block.cta.label}: ${block.cta.url}` : null,
    block.note ? `\n${block.note}` : null,
    '\n— AtualidadeAI Concursos',
  ]
    .filter((l) => l !== null)
    .join('\n')
}

function build(subject: string, preheader: string, title: string, block: Block): RenderedEmail {
  return { subject, html: layout({ preheader, title, block }), text: toText(title, block) }
}

/** E-mails transacionais (enviados pelas Edge Functions). */
export function renderTransactional(kind: TransactionalKind, d: EmailData): RenderedEmail {
  const ola = firstName(d.name) ? `Olá, ${firstName(d.name)}!` : 'Olá!'
  const conta = `${d.siteUrl.replace(/\/+$/, '')}/conta`
  const valor = formatBRL(d.amount ?? null)
  const proxima = formatDateBR(d.nextPaymentDate)

  switch (kind) {
    case 'assinatura_ativada':
      return build('Sua assinatura está ativa', 'Contratação confirmada: bem-vindo ao AtualidadeAI Concursos.', 'Contratação confirmada', {
        paragraphs: [
          ola,
          'Sua assinatura do AtualidadeAI Concursos foi confirmada pelo Mercado Pago e já está ativa.',
          [valor && `Valor: ${valor} por mês.`, proxima && `Próxima cobrança: ${proxima}.`].filter(Boolean).join(' ') ||
            'A cobrança é mensal e renovada automaticamente.',
        ],
        cta: { label: 'Ver minha assinatura', url: conta },
        note: 'Você pode cancelar a qualquer momento em Minha conta. O cancelamento interrompe as próximas cobranças.',
      })

    case 'orientacoes_iniciais':
      return build('Primeiros passos no AtualidadeAI', 'Como aproveitar seus materiais de atualidades.', 'Primeiros passos', {
        paragraphs: [ola, 'Veja como aproveitar ao máximo sua assinatura:'],
        list: [
          'Confira seu estado e sua cidade em Minha conta: eles definem as atualidades regionais do seu material.',
          'O material diário traz os fatos mais relevantes com contexto e relação com provas.',
          'Use os compilados semanal e mensal para revisar antes da prova.',
          'Adicione este remetente aos seus contatos para que os e-mails não caiam no spam.',
        ],
        cta: { label: 'Acessar minha conta', url: conta },
        note: 'O AtualidadeAI é um complemento ao seu estudo de atualidades e não substitui o conteúdo do edital.',
      })

    case 'pagamento_aprovado':
      return build(`Pagamento aprovado${valor ? ` — ${valor}` : ''}`, 'Recebemos seu pagamento. Obrigado!', 'Pagamento aprovado', {
        paragraphs: [
          ola,
          `O Mercado Pago confirmou o pagamento${valor ? ` de ${valor}` : ''} da sua assinatura.`,
          proxima ? `Próxima cobrança prevista: ${proxima}.` : 'Sua assinatura segue ativa.',
        ],
        cta: { label: 'Ver minha assinatura', url: conta },
        note: 'O comprovante completo está disponível na sua conta do Mercado Pago.',
      })

    case 'pagamento_pendente':
      return build('Pagamento em processamento', 'Estamos aguardando a confirmação do Mercado Pago.', 'Pagamento em processamento', {
        paragraphs: [
          ola,
          `Recebemos sua solicitação${valor ? ` de pagamento de ${valor}` : ''}, mas o Mercado Pago ainda não confirmou a transação.`,
          'Isso costuma levar poucos minutos. Assim que for confirmado, sua assinatura será ativada automaticamente e avisaremos por e-mail.',
        ],
        cta: { label: 'Acompanhar em Minha conta', url: conta },
      })

    case 'pagamento_recusado':
      return build('Pagamento não aprovado', 'Não foi possível concluir o pagamento da sua assinatura.', 'Pagamento não aprovado', {
        paragraphs: [
          ola,
          `O Mercado Pago não aprovou o pagamento${valor ? ` de ${valor}` : ''} da sua assinatura.`,
          'Você pode tentar novamente com outro cartão ou conferir os dados com o emissor do cartão. Nenhum valor foi cobrado por esta tentativa.',
        ],
        cta: { label: 'Tentar novamente', url: conta },
      })
  }
}

/**
 * Modelos de autenticação aplicados ao Supabase Auth (Authentication → Emails).
 * Usam as variáveis do Supabase ({{ .ConfirmationURL }}), por isso `raw: true`.
 */
export function renderAuthTemplates(): Record<'confirmation' | 'recovery', { subject: string; html: string }> {
  return {
    confirmation: {
      subject: 'Confirme seu cadastro no AtualidadeAI Concursos',
      html: layout({
        raw: true,
        preheader: 'Falta só um passo para ativar sua conta.',
        title: 'Confirme seu e-mail',
        block: {
          paragraphs: [
            'Olá!',
            'Recebemos seu cadastro no AtualidadeAI Concursos. Para ativar sua conta, confirme seu e-mail clicando no botão abaixo.',
          ],
          cta: { label: 'Confirmar meu e-mail', url: '{{ .ConfirmationURL }}' },
          note: 'Se você não fez este cadastro, ignore este e-mail. O link expira em 24 horas.',
        },
      }),
    },
    recovery: {
      subject: 'Redefinição de senha — AtualidadeAI Concursos',
      html: layout({
        raw: true,
        preheader: 'Crie uma nova senha para sua conta.',
        title: 'Redefinir senha',
        block: {
          paragraphs: ['Olá!', 'Recebemos um pedido para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha.'],
          cta: { label: 'Criar nova senha', url: '{{ .ConfirmationURL }}' },
          note: 'Se você não pediu a redefinição, ignore este e-mail: sua senha atual continua valendo. O link expira em 1 hora.',
        },
      }),
    },
  }
}
