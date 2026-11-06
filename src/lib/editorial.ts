import { call } from '@/lib/billing'

/**
 * Painel editorial. Tudo passa pela Edge Function "editorial", que confere no servidor
 * administrador + MFA; esta camada só tipa as respostas.
 */

export type EditionStatus = 'draft' | 'in_review' | 'approved' | 'generating' | 'generated' | 'published' | 'failed'
export type DocumentRow = { id: string; edition_id?: string; version: number; page_count: number | null; file_size: number | null; qa_status: 'pending' | 'passed' | 'failed'; status: string; created_at: string; qa_report?: { errors: string[]; warnings: string[] } | null; template_version?: string }
export type EditionRow = {
  id: string
  edition_type: 'diaria' | 'semanal' | 'mensal'
  state: string
  reference_date: string
  status: EditionStatus
  current_version: number
  summary: { blocks?: Record<string, number> } | null
  updated_at: string
  document: DocumentRow | null
}
export type JobRow = { id?: string; job_type: string; status: string; attempts: number; last_error: string | null; result: unknown; created_at: string; finished_at: string | null }

export type Dashboard = {
  today: string
  editions: EditionRow[]
  reviewCount: number
  ai: { calls: number; errors: number; invalidOutputs: number; tokens: number; budget: number }
  jobs: Record<string, JobRow>
  sources: { active: number; failing: number; total: number }
  newsLast24h: number
}

export type ClusterBrief = { id: string; scope: 'estadual' | 'nacional' | 'internacional'; state: string | null; category: string | null; relevance_score: number | null; verification_status: string | null; source_count: number; needs_review: boolean; status: string }
export type AuditStatus = 'pendente' | 'aprovada' | 'reprovada' | 'erro' | 'dispensada'
export type AnalysisKind = 'analise' | 'sintese_semanal' | 'sintese_mensal'
export type AuditClaim = { field: string; claim: string; verdict: 'apoiada' | 'parcial' | 'sem_suporte' | 'contradita'; source: number | null; quote: string | null; quoteFound: boolean; note: string | null }
export type AuditReport = {
  status?: 'aprovada' | 'reprovada'
  claims?: AuditClaim[]
  summary?: { total: number; apoiada: number; parcial: number; sem_suporte: number; contradita: number; quotes_not_found: number }
  problems?: string[]
  attempts?: number
  reused?: boolean
}
export type PeriodMeta = { edition_type?: string; dates?: string[]; timeline?: { data: string; fato: string }[]; source_analysis_ids?: string[] }
export type EditionItem = { block: 'estado' | 'nacional' | 'internacional'; position: number; analysis_id: string; news_analyses: { id: string; status: string; kind: AnalysisKind; audit_status: AuditStatus; audit_report: AuditReport | null; period_meta: PeriodMeta | null; editorial_title: string; summary: string; cluster_id: string; news_clusters: ClusterBrief } }
export type Candidate = { cluster_id: string; analysis_id: string; title: string; audit_status?: AuditStatus; scope: string; state: string | null; relevance_score: number | null; verification_status: string | null; source_count: number; needs_review: boolean }
export type EditionDetail = { edition: EditionRow & { period_start: string; period_end: string }; items: EditionItem[]; documents: DocumentRow[]; candidates: Candidate[] }

export type ReviewRow = ClusterBrief & { title: string; last_seen_at: string; analysis: { id: string; kind: AnalysisKind; status: string; audit_status: AuditStatus; audit_report: AuditReport | null; validation_errors: { erros?: string[]; avisos?: string[] } | null } | null }
export type Analysis = {
  id: string
  status: string
  kind: AnalysisKind
  audit_status: AuditStatus
  audit_report: AuditReport | null
  audit_model: string | null
  audited_at: string | null
  period_meta: PeriodMeta | null
  model: string
  prompt_version: string
  editorial_title: string | null
  summary: string | null
  what_happened: string | null
  context: string | null
  why_it_matters: string | null
  relevance_for_exams: string | null
  memorize: string[]
  questions: { enunciado: string; alternativas: Record<string, string>; gabarito: string; comentario: string }[]
  references: { url: string; source: string | null; official: boolean }[]
  validation_errors: { erros?: string[]; avisos?: string[] } | null
  content: { bruto?: string } | null
  edited_by: string | null
  generated_at: string
}
export type ClusterDetail = {
  cluster: ClusterBrief & { title: string; relevance: string | null; verification_confidence: string | null; last_seen_at: string }
  members: { id: string; title: string; excerpt: string | null; original_url: string; published_at: string | null; news_sources: { name: string; is_primary: boolean; reliability_level: number } }[]
  verification: { verification_status: string; confidence_level: string; analysis: string | null; independent_sources: number; verified_at: string } | null
  analyses: Analysis[]
  history: { action: string; notes: string | null; changes: unknown; created_at: string }[]
}

export type SourceRow = {
  id: string
  name: string
  website: string
  feed_url: string | null
  source_type: string
  scope: 'estadual' | 'nacional' | 'internacional'
  state: string | null
  language: string
  reliability_level: number
  is_primary: boolean
  is_active: boolean
  content_mode: 'full' | 'summary'
  consecutive_failures: number
  last_checked_at: string | null
  last_success_at: string | null
  last_error: string | null
  terms_notes: string | null
  news_source_groups: { name: string } | null
  week: { runs: number; ok: number; inserted: number }
}
export type NewSourceInput = {
  name: string
  feed_url: string
  source_type: 'rss' | 'atom' | 'sitemap'
  scope: 'estadual' | 'nacional' | 'internacional'
  state?: string
  country?: string
  language: 'pt' | 'en' | 'es' | 'fr'
  default_category?: string
  reliability_level: number
  is_primary: boolean
  content_mode: 'full' | 'summary'
  terms_notes: string
}
export type SettingRow = { key: string; label: string; help: string; value: unknown; updated_at: string | null }
export type Robot = {
  jobs: JobRow[]
  aiByDay: { day: string; calls: number; errors: number; invalid: number; tokens: number }[]
  fetchErrors: { status: string; error: string | null; created_at: string; news_sources: { name: string } }[]
}
export type AnalysisChanges = Partial<Record<'editorial_title' | 'summary' | 'what_happened' | 'context' | 'why_it_matters' | 'relevance_for_exams', string>> & { memorize?: string[] }

const ed = <T>(action: string, extra: Record<string, unknown> = {}) => call<T>('editorial', { action, ...extra })

export const editorialApi = {
  dashboard: () => ed<Dashboard>('dashboard'),
  edition: (id: string) => ed<EditionDetail>('edition', { edition_id: id }),
  editionStatus: (id: string, op: 'approve' | 'hold' | 'regenerate', notes?: string) => ed<{ ok: true; status: EditionStatus }>('edition_status', { edition_id: id, op, notes }),
  editionItem: (id: string, analysisId: string, op: 'add' | 'remove' | 'up' | 'down', block?: string) => ed<{ ok: true }>('edition_item', { edition_id: id, analysis_id: analysisId, op, block }),
  documentUrl: (id: string) => ed<{ url: string; expiresIn: number }>('document_url', { document_id: id }),
  reviewQueue: () => ed<{ rows: ReviewRow[] }>('review_queue'),
  cluster: (id: string) => ed<ClusterDetail>('cluster', { cluster_id: id }),
  decide: (id: string, decision: 'approve' | 'reject' | 'reanalyze', notes?: string) => ed<{ ok: true }>('cluster_decide', { cluster_id: id, decision, notes }),
  editAnalysis: (id: string, changes: AnalysisChanges, notes?: string) => ed<{ ok: true; analysis_id: string }>('analysis_edit', { analysis_id: id, changes, notes }),
  auditDecide: (id: string, op: 'waive' | 'reaudit', notes?: string) => ed<{ ok: true }>('audit_decide', { analysis_id: id, op, notes }),
  sources: () => ed<{ rows: SourceRow[] }>('sources'),
  updateSource: (id: string, patch: { is_active?: boolean; reliability_level?: number; terms_notes?: string }) => ed<{ ok: true }>('source_update', { source_id: id, ...patch }),
  createSource: (source: NewSourceInput) => ed<{ ok: true; source_id: string }>('source_create', { source }),
  settings: () => ed<{ rows: SettingRow[] }>('settings'),
  updateSetting: (key: string, value: unknown) => ed<{ ok: true }>('setting_update', { key, value }),
  robot: () => ed<Robot>('robot'),
}

export const editionTypeLabels: Record<string, string> = { diaria: 'Diária', semanal: 'Semanal', mensal: 'Mensal' }
export const editionStatusLabels: Record<EditionStatus, { label: string; tone: 'success' | 'warning' | 'neutral' | 'brand' | 'signal' }> = {
  draft: { label: 'Retida', tone: 'neutral' },
  in_review: { label: 'Em revisão', tone: 'warning' },
  approved: { label: 'Aprovada', tone: 'signal' },
  generating: { label: 'Gerando', tone: 'brand' },
  generated: { label: 'PDF gerado', tone: 'success' },
  published: { label: 'Publicada', tone: 'success' },
  failed: { label: 'Falhou', tone: 'warning' },
}
export const verificationLabels: Record<string, string> = {
  corroborada: 'Corroborada',
  parcialmente_corroborada: 'Parcialmente corroborada',
  nao_confirmada: 'Não confirmada (fonte única)',
  fontes_divergentes: 'Fontes divergentes',
  contradita: 'Contradita',
  insuficiente: 'Insuficiente',
}
export const auditLabels: Record<AuditStatus, { label: string; tone: 'success' | 'warning' | 'neutral' | 'brand' | 'signal' }> = {
  pendente: { label: 'Auditoria pendente', tone: 'neutral' },
  aprovada: { label: 'Auditada', tone: 'success' },
  reprovada: { label: 'Reprovada na auditoria', tone: 'warning' },
  erro: { label: 'Auditoria falhou', tone: 'warning' },
  dispensada: { label: 'Auditoria dispensada', tone: 'signal' },
}
export const kindLabels: Record<AnalysisKind, string> = { analise: 'Análise', sintese_semanal: 'Síntese semanal', sintese_mensal: 'Síntese mensal' }
export const verdictLabels: Record<AuditClaim['verdict'], string> = { apoiada: 'Sustentada', parcial: 'Parcial', sem_suporte: 'Sem suporte', contradita: 'Contradita' }
export const blockLabels: Record<string, string> = { estado: 'Estado', nacional: 'Brasil', internacional: 'Mundo' }
export const jobLabels: Record<string, string> = {
  collect: 'Coleta', triage: 'Triagem', cluster: 'Agrupamento', verify: 'Verificação', analyze: 'Análise (IA)', audit: 'Auditoria de veracidade', synthesize: 'Sínteses semanais/mensais', compose: 'Montagem da edição', render: 'Geração do PDF', healthcheck: 'Verificação de saúde',
}
export const fileSize = (b: number | null) => (b == null ? '—' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`)
