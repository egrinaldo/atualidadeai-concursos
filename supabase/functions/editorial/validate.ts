/**
 * Validação das entradas do painel editorial (funções puras, testadas em tests/editorial.test.ts).
 * Tudo que vem do navegador é tratado como não confiável, mesmo de administrador.
 */

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }
const ok = <T>(value: T): Result<T> => ({ ok: true, value })
const fail = <T>(error: string): Result<T> => ({ ok: false, error })

export const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']
const CATEGORIES = ['politica_nacional', 'politica_internacional', 'economia', 'educacao', 'saude', 'seguranca_publica', 'meio_ambiente', 'tecnologia', 'ciencia', 'relacoes_internacionais', 'direitos_humanos', 'legislacao', 'administracao_publica', 'sociedade', 'infraestrutura', 'cultura', 'acontecimentos_regionais']

/** Texto limpo: sem caracteres de controle, espaços normalizados, tamanho dentro do limite. */
export function cleanText(v: unknown, min: number, max: number, field: string): Result<string> {
  if (typeof v !== 'string') return fail(`${field}: texto obrigatório`)
  // deno-lint-ignore no-control-regex
  const s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/[ \t]+/g, ' ').trim()
  if (s.length < min) return fail(`${field}: mínimo de ${min} caracteres`)
  if (s.length > max) return fail(`${field}: máximo de ${max} caracteres`)
  return ok(s)
}

/** Campos da análise que o editor pode alterar (o restante permanece como a IA gerou). */
export const EDITABLE_FIELDS = {
  editorial_title: { label: 'Título', min: 10, max: 160 },
  summary: { label: 'Resumo', min: 30, max: 900 },
  what_happened: { label: 'O que aconteceu', min: 30, max: 2500 },
  context: { label: 'Contexto', min: 0, max: 2500 },
  why_it_matters: { label: 'Por que importa', min: 20, max: 2000 },
  relevance_for_exams: { label: 'Na prova', min: 20, max: 1500 },
} as const
export type EditableField = keyof typeof EDITABLE_FIELDS

export function validateAnalysisEdit(input: unknown): Result<{ fields: Partial<Record<EditableField, string>>; memorize?: string[] }> {
  if (!input || typeof input !== 'object') return fail('Nada para alterar.')
  const src = input as Record<string, unknown>
  const fields: Partial<Record<EditableField, string>> = {}
  for (const [k, rule] of Object.entries(EDITABLE_FIELDS) as [EditableField, (typeof EDITABLE_FIELDS)[EditableField]][]) {
    if (src[k] === undefined) continue
    const r = cleanText(src[k], rule.min, rule.max, rule.label)
    if (!r.ok) return r
    fields[k] = r.value
  }
  let memorize: string[] | undefined
  if (src.memorize !== undefined) {
    if (!Array.isArray(src.memorize) || src.memorize.length < 1 || src.memorize.length > 8) return fail('Para memorizar: de 1 a 8 itens')
    memorize = []
    for (const m of src.memorize) {
      const r = cleanText(m, 3, 300, 'Item de "Para memorizar"')
      if (!r.ok) return r
      memorize.push(r.value)
    }
  }
  if (!Object.keys(fields).length && !memorize) return fail('Nada para alterar.')
  return ok({ fields, memorize })
}

export type NewSource = {
  name: string
  website: string
  feed_url: string
  source_type: 'rss' | 'atom' | 'sitemap'
  scope: 'internacional' | 'nacional' | 'estadual'
  state: string | null
  country: string
  language: 'pt' | 'en' | 'es' | 'fr'
  default_category: string | null
  reliability_level: number
  is_primary: boolean
  content_mode: 'full' | 'summary'
  allowed_hosts: string[]
  terms_notes: string
}

/** Endereço público https sem credenciais, porta padrão e host que não seja IP nem nome local. */
export function publicHttpsUrl(v: unknown, field: string): Result<URL> {
  if (typeof v !== 'string' || v.length > 2000) return fail(`${field}: endereço inválido`)
  let u: URL
  try {
    u = new URL(v.trim())
  } catch {
    return fail(`${field}: endereço inválido`)
  }
  if (u.protocol !== 'https:') return fail(`${field}: use https://`)
  if (u.username || u.password) return fail(`${field}: não pode conter usuário/senha`)
  if (u.port && u.port !== '443') return fail(`${field}: porta não permitida`)
  const h = u.hostname.toLowerCase()
  if (/^\[|^\d+\.\d+\.\d+\.\d+$/.test(h) || !h.includes('.') || /(^|\.)(localhost|local|internal|lan|home|corp)$/.test(h))
    return fail(`${field}: o host precisa ser um domínio público`)
  return ok(u)
}

/**
 * Cadastro de fonte pelo painel. Proteções: só https público; allowed_hosts = apenas o host do feed
 * (o worker recusa redirecionamento para outro host e bloqueia IP interno — SSRF); veículo de imprensa
 * entra em modo resumo; a leitura dos termos de uso é obrigatória.
 */
export function validateNewSource(input: unknown): Result<NewSource> {
  if (!input || typeof input !== 'object') return fail('Dados da fonte ausentes.')
  const s = input as Record<string, unknown>
  const name = cleanText(s.name, 2, 120, 'Nome')
  if (!name.ok) return name
  const feed = publicHttpsUrl(s.feed_url, 'Endereço do feed')
  if (!feed.ok) return feed
  const site = publicHttpsUrl(s.website ?? `${feed.value.origin}/`, 'Site')
  if (!site.ok) return site
  const type = s.source_type
  if (type !== 'rss' && type !== 'atom' && type !== 'sitemap') return fail('Tipo: rss, atom ou sitemap')
  const scope = s.scope
  if (scope !== 'internacional' && scope !== 'nacional' && scope !== 'estadual') return fail('Alcance inválido')
  const state = scope === 'estadual' ? String(s.state ?? '').toUpperCase() : null
  if (scope === 'estadual' && !UFS.includes(state!)) return fail('UF inválida para fonte estadual')
  const language = s.language ?? 'pt'
  if (!['pt', 'en', 'es', 'fr'].includes(language as string)) return fail('Idioma: pt, en, es ou fr')
  const category = s.default_category ? String(s.default_category) : null
  if (category && !CATEGORIES.includes(category)) return fail('Categoria inválida')
  const reliability = Number(s.reliability_level)
  if (!Number.isInteger(reliability) || reliability < 1 || reliability > 5) return fail('Confiabilidade: de 1 a 5')
  const isPrimary = s.is_primary === true
  const mode = isPrimary && s.content_mode === 'full' ? 'full' : 'summary'
  const notes = cleanText(s.terms_notes, 20, 1000, 'Termos de uso e robots.txt (registre o que verificou)')
  if (!notes.ok) return notes
  const country = scope === 'internacional' ? String(s.country ?? 'XX').toUpperCase().slice(0, 2) : 'BR'
  if (!/^[A-Z]{2}$/.test(country)) return fail('País: código de 2 letras')
  return ok({
    name: name.value,
    website: site.value.href,
    feed_url: feed.value.href,
    source_type: type,
    scope,
    state,
    country,
    language: language as NewSource['language'],
    default_category: category,
    reliability_level: reliability,
    is_primary: isPrimary,
    content_mode: mode,
    allowed_hosts: [feed.value.hostname.toLowerCase()],
    terms_notes: notes.value,
  })
}

const int = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max

/** Configurações editáveis pelo painel (lista fechada) e a validação de cada uma. */
export const SETTINGS: Record<string, { label: string; help: string; check: (v: unknown) => boolean }> = {
  'ai.daily_call_budget': { label: 'Cota diária de chamadas à IA', help: 'Inteiro de 0 a 500', check: (v) => int(v, 0, 500) },
  'ai.max_calls_per_run': { label: 'Chamadas de IA por rodada (a cada 3h)', help: 'Inteiro de 0 a 30', check: (v) => int(v, 0, 30) },
  'ai.analysis_per_block': {
    label: 'Análises por bloco (IA)',
    help: '{"estado": n, "nacional": n, "internacional": n}, cada um de 0 a 20',
    check: (v) => !!v && typeof v === 'object' && ['estado', 'nacional', 'internacional'].every((k) => int((v as Record<string, unknown>)[k], 0, 20)) && Object.keys(v).length === 3,
  },
  'edition.items_per_block': {
    label: 'Assuntos por bloco em cada edição',
    help: '{"diaria": {...}, "semanal": {...}, "mensal": {...}} com estado/nacional/internacional de 0 a 30',
    check: (v) =>
      !!v && typeof v === 'object' && Object.keys(v).length === 3 &&
      ['diaria', 'semanal', 'mensal'].every((t) => {
        const b = (v as Record<string, Record<string, unknown>>)[t]
        return !!b && typeof b === 'object' && Object.keys(b).length === 3 && ['estado', 'nacional', 'internacional'].every((k) => int(b[k], 0, 30))
      }),
  },
  'triage.min_relevance_for_edition': { label: 'Relevância mínima para entrar na edição', help: 'baixa, media, alta ou muito_alta', check: (v) => ['baixa', 'media', 'alta', 'muito_alta'].includes(v as string) },
  'triage.similarity_threshold': { label: 'Limiar de agrupamento', help: 'Número de 0,2 a 0,8 (padrão 0,38)', check: (v) => typeof v === 'number' && v >= 0.2 && v <= 0.8 },
  'verification.single_source_min_reliability': { label: 'Confiabilidade mínima para fonte única', help: 'Inteiro de 1 a 5', check: (v) => int(v, 1, 5) },
  'verification.edition_statuses': {
    label: 'Status de verificação aceitos na edição',
    help: 'Lista com: corroborada, parcialmente_corroborada, nao_confirmada',
    check: (v) => Array.isArray(v) && v.length >= 1 && v.every((x) => ['corroborada', 'parcialmente_corroborada', 'nao_confirmada'].includes(x)) && new Set(v).size === v.length,
  },
}

export function validateSetting(key: unknown, value: unknown): Result<{ key: string; value: unknown }> {
  if (typeof key !== 'string' || !(key in SETTINGS)) return fail('Configuração não editável pelo painel.')
  if (!SETTINGS[key].check(value)) return fail(`Valor inválido: ${SETTINGS[key].help}`)
  return ok({ key, value })
}

/** Transições de status da edição permitidas ao editor. */
export const EDITION_TRANSITIONS: Record<string, string[]> = {
  approve: ['draft', 'in_review', 'failed'], // → approved (gera no próximo horário ou ao disparar o workflow)
  hold: ['in_review', 'approved', 'failed'], // → draft (não gera)
  regenerate: ['generated', 'failed'], // → approved (nova versão)
}
