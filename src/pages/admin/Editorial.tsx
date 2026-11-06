import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Alert } from '@/components/forms/Alert'
import { Badge, Button } from '@/components/ui'
import { shortDate } from '@/lib/admin'
import {
  auditLabels,
  blockLabels,
  editionStatusLabels,
  editionTypeLabels,
  editorialApi,
  fileSize,
  jobLabels,
  kindLabels,
  verdictLabels,
  verificationLabels,
  type Analysis,
  type AnalysisChanges,
  type AuditStatus,
  type ClusterDetail,
  type Dashboard,
  type EditionDetail,
  type EditionRow,
  type NewSourceInput,
  type ReviewRow,
  type Robot,
  type SettingRow,
  type SourceRow,
} from '@/lib/editorial'
import { cn } from '@/utils/cn'
import { inputClass, Kpi, Modal, Panel, Table, td } from './parts'

type Loaded<T> = { ok: true; data: T } | { ok: false; message: string }

function useLoad<T>(loader: () => Promise<Loaded<T>>) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const reload = useCallback(() => {
    setBusy(true)
    loader().then((r) => {
      if (r.ok) {
        setData(r.data)
        setError(null)
      } else setError(r.message)
      setBusy(false)
    })
  }, [])
  useEffect(reload, [reload])
  return { data, error, busy, reload }
}

const Loading = () => (
  <p className="py-16 text-center text-sm text-slate-400" role="status">
    Carregando…
  </p>
)
const Refresh = ({ onClick, busy }: { onClick: () => void; busy: boolean }) => (
  <Button variant="secondary" size="sm" onClick={onClick} disabled={busy}>
    {busy ? 'Atualizando…' : 'Atualizar'}
  </Button>
)
const scopeLabel = (scope: string, state: string | null) => (scope === 'estadual' ? `Estado · ${state ?? ''}` : scope === 'nacional' ? 'Brasil' : 'Mundo')

/** Executa uma ação do painel, mostra o resultado e recarrega. */
function useAction(after: () => void) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  async function run(fn: () => Promise<Loaded<unknown>>, ok: string) {
    setBusy(true)
    setMsg(null)
    const r = await fn()
    setBusy(false)
    if (r.ok) {
      setMsg({ tone: 'success', text: ok })
      after()
    } else setMsg({ tone: 'error', text: r.message })
  }
  return { busy, msg, run, clear: () => setMsg(null) }
}
const Feedback = ({ msg }: { msg: { tone: 'success' | 'error'; text: string } | null }) => (msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null)

/* =============================== Editorial =============================== */

export function EditorialTab() {
  const dash = useLoad<Dashboard>(editorialApi.dashboard)
  const queue = useLoad<{ rows: ReviewRow[] }>(editorialApi.reviewQueue)
  const [edition, setEdition] = useState<string | null>(null)
  const [cluster, setCluster] = useState<string | null>(null)
  const reloadAll = () => {
    dash.reload()
    queue.reload()
  }

  if (dash.error) return <Alert tone="error">{dash.error}</Alert>
  if (!dash.data) return <Loading />
  const d = dash.data
  const lastCollect = d.jobs.collect

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          Hoje: {shortDate(`${d.today}T12:00:00-03:00`)} · última coleta {lastCollect ? shortDate(lastCollect.created_at, true) : '—'}
        </p>
        <Refresh onClick={reloadAll} busy={dash.busy || queue.busy} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Notícias nas últimas 24h" value={d.newsLast24h.toLocaleString('pt-BR')} hint={`${d.sources.active} fontes ativas`} />
        <Kpi label="Aguardando revisão" value={String(d.reviewCount)} tone={d.reviewCount ? 'bad' : 'good'} hint="assuntos dos últimos 7 dias" />
        <Kpi label="IA hoje" value={`${d.ai.calls}/${d.ai.budget}`} hint={`${d.ai.tokens.toLocaleString('pt-BR')} tokens · ${d.ai.errors} erro(s) · ${d.ai.invalidOutputs} corrigida(s)`} tone={d.ai.calls >= d.ai.budget ? 'bad' : 'default'} />
        <Kpi label="Fontes com falha" value={String(d.sources.failing)} tone={d.sources.failing ? 'bad' : 'good'} hint={`de ${d.sources.active} ativas`} />
      </div>

      <Panel title="Edições">
        <p className="mb-4 text-sm text-slate-400">
          Montagem às 22h12 · revisão até 04h30 · geração do PDF às 04h35 (horário de Brasília). Edição <strong className="text-slate-200">em revisão</strong> é aprovada automaticamente no horário-limite; use <strong className="text-slate-200">Reter</strong> para impedir.
        </p>
        <Table head={['Data', 'Edição', 'Status', 'Assuntos', 'PDF', '']} empty={!d.editions.length}>
          {d.editions.map((e) => (
            <EditionLine key={e.id} e={e} onOpen={() => setEdition(e.id)} />
          ))}
        </Table>
      </Panel>

      <Panel title={`Fila de revisão${queue.data ? ` (${queue.data.rows.length})` : ''}`}>
        {queue.error && <Alert tone="error">{queue.error}</Alert>}
        {!queue.data ? (
          <Loading />
        ) : (
          <Table head={['Assunto', 'Bloco', 'Nota', 'Verificação', 'Motivo', '']} empty={!queue.data.rows.length}>
            {queue.data.rows.map((r) => (
              <tr key={r.id} className="border-t border-white/5">
                <td className={cn(td, 'max-w-md')}>
                  <p className="line-clamp-2 font-medium text-white">{r.title}</p>
                  <p className="text-xs text-slate-500">{shortDate(r.last_seen_at, true)}</p>
                </td>
                <td className={td}>{scopeLabel(r.scope, r.state)}</td>
                <td className={td}>{r.relevance_score ?? '—'}</td>
                <td className={td}>{verificationLabels[r.verification_status ?? ''] ?? '—'}</td>
                <td className={cn(td, 'max-w-xs text-xs text-slate-400')}>{reviewReason(r)}</td>
                <td className={cn(td, 'text-right')}>
                  <Button size="sm" variant="secondary" onClick={() => setCluster(r.id)}>
                    Revisar
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      {edition && <EditionModal id={edition} onClose={() => setEdition(null)} onChanged={reloadAll} onOpenCluster={setCluster} />}
      {cluster && <ClusterModal id={cluster} onClose={() => setCluster(null)} onChanged={reloadAll} />}
    </div>
  )
}

function reviewReason(r: ReviewRow): string {
  const v = r.analysis?.validation_errors
  if (r.analysis?.audit_status === 'reprovada') return `Auditoria de veracidade: ${r.analysis.audit_report?.problems?.[0]?.slice(0, 140) ?? 'reprovada'}`
  if (r.analysis?.audit_status === 'erro') return 'Auditoria de veracidade não concluída'
  if (r.analysis?.status === 'invalid') return `Análise reprovada: ${v?.erros?.[0] ?? 'formato inválido'}`
  if (v?.avisos?.length) return v.avisos.filter((a) => !a.startsWith('corrigida após')).slice(0, 2).join(' · ') || 'Aviso da IA'
  if (r.verification_status === 'fontes_divergentes' || r.verification_status === 'contradita') return verificationLabels[r.verification_status]
  if (r.verification_status === 'nao_confirmada' || r.verification_status === 'insuficiente') return 'Fonte única de baixa confiabilidade'
  return 'Revisão solicitada'
}

function StatusPill({ status }: { status: EditionRow['status'] }) {
  const s = editionStatusLabels[status] ?? { label: status, tone: 'neutral' as const }
  return (
    <Badge tone={s.tone} className="whitespace-nowrap normal-case tracking-normal">
      {s.label}
    </Badge>
  )
}

function EditionLine({ e, onOpen }: { e: EditionRow; onOpen: () => void }) {
  const b = e.summary?.blocks ?? {}
  return (
    <tr className="border-t border-white/5">
      <td className={td}>{shortDate(`${e.reference_date}T12:00:00-03:00`)}</td>
      <td className={td}>
        <span className="font-medium text-white">{editionTypeLabels[e.edition_type]}</span> <span className="text-slate-400">· {e.state}</span>
      </td>
      <td className={td}>
        <StatusPill status={e.status} />
      </td>
      <td className={cn(td, 'whitespace-nowrap text-slate-300')}>
        {b.estado ?? 0} · {b.nacional ?? 0} · {b.internacional ?? 0}
      </td>
      <td className={cn(td, 'whitespace-nowrap text-xs text-slate-400')}>
        {e.document ? `v${e.document.version} · ${e.document.page_count ?? '?'} p. · ${fileSize(e.document.file_size)} · QA ${e.document.qa_status === 'passed' ? 'ok' : e.document.qa_status}` : '—'}
      </td>
      <td className={cn(td, 'text-right')}>
        <Button size="sm" variant="secondary" onClick={onOpen}>
          Abrir
        </Button>
      </td>
    </tr>
  )
}

function EditionModal({ id, onClose, onChanged, onOpenCluster }: { id: string; onClose: () => void; onChanged: () => void; onOpenCluster: (id: string) => void }) {
  const { data, error, reload } = useLoad<EditionDetail>(() => editorialApi.edition(id))
  const act = useAction(() => {
    reload()
    onChanged()
  })
  const [addBlock, setAddBlock] = useState<Record<string, string>>({})
  async function download(docId: string) {
    const r = await editorialApi.documentUrl(docId)
    if (r.ok) window.open(r.data.url, '_blank', 'noopener')
    else act.run(async () => r, '')
  }
  const title = data ? `${editionTypeLabels[data.edition.edition_type]} · ${data.edition.state} · ${shortDate(`${data.edition.reference_date}T12:00:00-03:00`)}` : 'Edição'
  const st = data?.edition.status
  const editable = st && ['draft', 'in_review', 'approved', 'failed'].includes(st)

  return (
    <Modal title={title} onClose={onClose} wide>
      {error && <Alert tone="error">{error}</Alert>}
      {!data ? (
        <Loading />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={data.edition.status} />
            <span className="text-xs text-slate-400">
              Período: {shortDate(data.edition.period_start, true)} a {shortDate(data.edition.period_end, true)}
            </span>
          </div>
          <Feedback msg={act.msg} />
          <div className="flex flex-wrap gap-2">
            {st && ['draft', 'in_review', 'failed'].includes(st) && (
              <Button size="sm" disabled={act.busy} onClick={() => act.run(() => editorialApi.editionStatus(id, 'approve'), 'Edição aprovada. O PDF sai no próximo horário de geração (ou dispare o workflow "worker-edition → render").')}>
                Aprovar
              </Button>
            )}
            {st && ['in_review', 'approved', 'failed'].includes(st) && (
              <Button size="sm" variant="secondary" disabled={act.busy} onClick={() => act.run(() => editorialApi.editionStatus(id, 'hold'), 'Edição retida: não será gerada até ser aprovada.')}>
                Reter
              </Button>
            )}
            {st && ['generated', 'failed'].includes(st) && (
              <Button size="sm" variant="secondary" disabled={act.busy} onClick={() => act.run(() => editorialApi.editionStatus(id, 'regenerate'), 'Liberada para nova versão. Ajuste os itens e dispare a geração.')}>
                Gerar de novo
              </Button>
            )}
          </div>

          {(['estado', 'nacional', 'internacional'] as const).map((block) => {
            const items = data.items.filter((i) => i.block === block).sort((a, b) => a.position - b.position)
            const cands = data.candidates.filter((c) => (block === 'estado' ? c.scope === 'estadual' : c.scope === block))
            return (
              <section key={block}>
                <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-wider text-brand-300">
                  {blockLabels[block]} {block === 'estado' ? `· ${data.edition.state}` : ''} <span className="text-slate-500">({items.length})</span>
                </h3>
                <ol className="space-y-2">
                  {items.map((it, i) => {
                    const c = it.news_analyses.news_clusters
                    return (
                      <li key={it.analysis_id} className="flex items-start gap-3 rounded-xl border border-white/10 bg-navy-950/40 p-3">
                        <span className="mt-0.5 font-display text-sm font-bold text-brand-400">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <button type="button" className="text-left text-sm font-medium text-white hover:text-brand-200" onClick={() => onOpenCluster(c.id)}>
                            {it.news_analyses.editorial_title}
                          </button>
                          <p className="mt-0.5 text-xs text-slate-400">
                            nota {c.relevance_score ?? '—'} · {verificationLabels[c.verification_status ?? ''] ?? '—'} · {c.source_count} fonte(s)
                            {it.news_analyses.status === 'edited' && ' · editada'}
                            {it.news_analyses.kind !== 'analise' && ` · ${kindLabels[it.news_analyses.kind]}${it.news_analyses.period_meta?.dates?.length ? ` (${it.news_analyses.period_meta.dates.length} dias)` : ''}`}
                          </p>
                          <div className="mt-1">
                            <AuditPill status={it.news_analyses.audit_status} />
                          </div>
                        </div>
                        {editable && (
                          <div className="flex shrink-0 gap-1">
                            <IconBtn label="Subir" disabled={act.busy || i === 0} onClick={() => act.run(() => editorialApi.editionItem(id, it.analysis_id, 'up'), 'Ordem alterada.')}>↑</IconBtn>
                            <IconBtn label="Descer" disabled={act.busy || i === items.length - 1} onClick={() => act.run(() => editorialApi.editionItem(id, it.analysis_id, 'down'), 'Ordem alterada.')}>↓</IconBtn>
                            <IconBtn label="Remover da edição" disabled={act.busy} onClick={() => act.run(() => editorialApi.editionItem(id, it.analysis_id, 'remove'), 'Assunto removido da edição.')}>✕</IconBtn>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ol>
                {editable && cands.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    <select className={cn(inputClass, 'h-9 text-xs')} value={addBlock[block] ?? ''} onChange={(e) => setAddBlock({ ...addBlock, [block]: e.target.value })} aria-label={`Incluir assunto em ${blockLabels[block]}`}>
                      <option value="">Incluir assunto…</option>
                      {cands.map((c) => (
                        <option key={c.analysis_id} value={c.analysis_id}>
                          [{c.relevance_score ?? '—'}] {c.title.slice(0, 90)}
                          {c.needs_review ? ' (em revisão)' : ''}
                        </option>
                      ))}
                    </select>
                    <Button size="sm" variant="secondary" disabled={!addBlock[block] || act.busy} onClick={() => act.run(() => editorialApi.editionItem(id, addBlock[block], 'add', block), 'Assunto incluído.')}>
                      Incluir
                    </Button>
                  </div>
                )}
              </section>
            )
          })}

          <section>
            <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-wider text-brand-300">PDFs gerados</h3>
            {!data.documents.length && <p className="text-sm text-slate-400">Nenhum PDF gerado ainda.</p>}
            <ul className="space-y-2">
              {data.documents.map((doc) => (
                <li key={doc.id} className="rounded-xl border border-white/10 bg-navy-950/40 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-white">
                      v{doc.version} · {doc.page_count ?? '?'} páginas · {fileSize(doc.file_size)} · {shortDate(doc.created_at, true)}
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge tone={doc.qa_status === 'passed' ? 'success' : 'warning'} className="normal-case tracking-normal">
                        QA {doc.qa_status === 'passed' ? 'aprovado' : 'reprovado'}
                      </Badge>
                      {doc.status !== 'deleted' && (
                        <Button size="sm" variant="ghost" onClick={() => download(doc.id)}>
                          Baixar
                        </Button>
                      )}
                    </span>
                  </div>
                  {!!doc.qa_report?.errors?.length && <p className="mt-1 text-xs text-warning-400">Erros: {doc.qa_report.errors.join(' · ')}</p>}
                  {!!doc.qa_report?.warnings?.length && <p className="mt-1 text-xs text-slate-400">Avisos: {doc.qa_report.warnings.join(' · ')}</p>}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </Modal>
  )
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-30">
      {children}
    </button>
  )
}

const FIELDS: { key: keyof AnalysisChanges & string; label: string; rows: number }[] = [
  { key: 'editorial_title', label: 'Título', rows: 2 },
  { key: 'summary', label: 'Resumo', rows: 3 },
  { key: 'what_happened', label: 'O que aconteceu', rows: 6 },
  { key: 'context', label: 'Contexto', rows: 4 },
  { key: 'why_it_matters', label: 'Por que importa', rows: 4 },
  { key: 'relevance_for_exams', label: 'Na prova', rows: 3 },
]

function ClusterModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { data, error, reload } = useLoad<ClusterDetail>(() => editorialApi.cluster(id))
  const act = useAction(() => {
    reload()
    onChanged()
  })
  const [notes, setNotes] = useState('')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const analysis = data?.analyses.find((a) => (a.kind ?? 'analise') === 'analise' && ['valid', 'edited', 'invalid'].includes(a.status)) ?? null
  const syntheses = data?.analyses.filter((a) => a.kind && a.kind !== 'analise' && ['valid', 'edited'].includes(a.status)) ?? []

  function startEdit() {
    if (!analysis) return
    setForm({
      ...Object.fromEntries(FIELDS.map((f) => [f.key, (analysis[f.key as keyof typeof analysis] as string | null) ?? ''])),
      memorize: (analysis.memorize ?? []).join('\n'),
    })
    setEditing(true)
  }
  async function saveEdit() {
    if (!analysis) return
    const changes: AnalysisChanges = {}
    for (const f of FIELDS) {
      const v = (form[f.key] ?? '').trim()
      if (v !== ((analysis[f.key as keyof typeof analysis] as string | null) ?? '').trim()) (changes as Record<string, string>)[f.key] = v
    }
    const mem = (form.memorize ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
    if (mem.join('\n') !== (analysis.memorize ?? []).join('\n')) changes.memorize = mem
    await act.run(() => editorialApi.editAnalysis(analysis.id, changes, notes || undefined), 'Análise editada e aprovada (nova versão registrada; a original fica no histórico).')
    setEditing(false)
  }

  return (
    <Modal title="Revisão do assunto" onClose={onClose} wide>
      {error && <Alert tone="error">{error}</Alert>}
      {!data ? (
        <Loading />
      ) : (
        <div className="space-y-6">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-400">
              {scopeLabel(data.cluster.scope, data.cluster.state)} · nota {data.cluster.relevance_score ?? '—'} · {data.cluster.status}
              {data.cluster.needs_review && ' · aguardando revisão'}
            </p>
            <h3 className="mt-1 font-display text-lg font-bold text-white">{analysis?.editorial_title ?? data.cluster.title}</h3>
          </div>
          <Feedback msg={act.msg} />

          {data.verification && (
            <Box title={`Verificação: ${verificationLabels[data.verification.verification_status] ?? data.verification.verification_status} (confiança ${data.verification.confidence_level})`}>
              <p className="text-sm text-slate-300">{data.verification.analysis}</p>
            </Box>
          )}

          {analysis?.validation_errors && (analysis.validation_errors.erros?.length || analysis.validation_errors.avisos?.length) ? (
            <Box title="Alertas da validação automática" tone="warn">
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {[...(analysis.validation_errors.erros ?? []), ...(analysis.validation_errors.avisos ?? [])].map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </Box>
          ) : null}

          {analysis && analysis.status !== 'invalid' && <AuditBox a={analysis} busy={act.busy} notes={notes} run={act.run} />}

          {syntheses.map((sy) => (
            <Box key={sy.id} title={`${kindLabels[sy.kind]} · ${sy.period_meta?.dates?.length ?? 0} dia(s)`}>
              <p className="font-medium text-slate-100">{sy.editorial_title}</p>
              <p className="mt-1 text-sm text-slate-300">{sy.summary}</p>
              {!!sy.period_meta?.timeline?.length && (
                <ol className="mt-2 space-y-0.5 text-xs text-slate-400">
                  {sy.period_meta.timeline.map((t, i) => (
                    <li key={i}>
                      <b className="text-brand-300">{t.data}</b> {t.fato}
                    </li>
                  ))}
                </ol>
              )}
              <div className="mt-3">
                <AuditBox a={sy} busy={act.busy} notes={notes} run={act.run} compact />
              </div>
            </Box>
          ))}

          {analysis && !editing && (
            <Box title={`Análise (${analysis.status === 'invalid' ? 'reprovada na validação' : analysis.status === 'edited' ? 'editada' : 'IA'} · ${analysis.model.split('/').pop()} · ${analysis.prompt_version})`}>
              {analysis.status === 'invalid' ? (
                <p className="whitespace-pre-wrap text-xs text-slate-400">{analysis.content?.bruto?.slice(0, 3000) ?? 'Sem conteúdo aproveitável.'}</p>
              ) : (
                <div className="space-y-3 text-sm text-slate-300">
                  <p className="font-semibold text-slate-100">{analysis.summary}</p>
                  {FIELDS.slice(2).map((f) => {
                    const v = analysis[f.key as keyof typeof analysis] as string | null
                    return v ? (
                      <div key={f.key}>
                        <p className="text-xs font-semibold uppercase tracking-wider text-brand-300">{f.label}</p>
                        <p>{v}</p>
                      </div>
                    ) : null
                  })}
                  {!!analysis.memorize?.length && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-brand-300">Para memorizar</p>
                      <ul className="list-disc pl-5">{analysis.memorize.map((m, i) => <li key={i}>{m}</li>)}</ul>
                    </div>
                  )}
                  {analysis.questions?.map((q, i) => (
                    <div key={i} className="rounded-lg border border-white/10 p-3">
                      <p className="font-medium text-slate-100">{q.enunciado}</p>
                      <ol className="mt-1 space-y-0.5 text-xs">
                        {Object.entries(q.alternativas).map(([k, v]) => (
                          <li key={k} className={k === q.gabarito ? 'text-success-400' : ''}>
                            {k}) {v}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              )}
            </Box>
          )}

          {editing && (
            <Box title="Editar análise">
              <div className="space-y-3">
                {FIELDS.map((f) => (
                  <label key={f.key} className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {f.label}
                    <textarea rows={f.rows} className={cn(inputClass, 'mt-1 h-auto py-2 text-sm normal-case tracking-normal')} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                  </label>
                ))}
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Para memorizar (um item por linha)
                  <textarea rows={5} className={cn(inputClass, 'mt-1 h-auto py-2 text-sm normal-case tracking-normal')} value={form.memorize ?? ''} onChange={(e) => setForm({ ...form, memorize: e.target.value })} />
                </label>
                <p className="text-xs text-slate-500">Confira números e nomes nas fontes abaixo. As questões permanecem como a IA gerou.</p>
              </div>
            </Box>
          )}

          <Box title={`Fontes (${data.members.length})`}>
            <ul className="space-y-2 text-sm">
              {data.members.map((m) => (
                <li key={m.id}>
                  <a href={m.original_url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-200 hover:text-white">
                    {m.title}
                  </a>
                  <p className="text-xs text-slate-500">
                    {m.news_sources.name}
                    {m.news_sources.is_primary ? ' · oficial' : ''} · {shortDate(m.published_at, true)}
                  </p>
                </li>
              ))}
            </ul>
          </Box>

          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Observação (opcional, fica no histórico)
            <input className={cn(inputClass, 'mt-1 normal-case tracking-normal')} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <div className="flex flex-wrap gap-2">
            {editing ? (
              <>
                <Button size="sm" disabled={act.busy} onClick={saveEdit}>
                  Salvar e aprovar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
              </>
            ) : (
              <>
                {analysis?.status !== 'invalid' && (
                  <Button size="sm" disabled={act.busy} onClick={() => act.run(() => editorialApi.decide(id, 'approve', notes || undefined), 'Assunto aprovado.')}>
                    Aprovar
                  </Button>
                )}
                {analysis && (
                  <Button size="sm" variant="secondary" disabled={act.busy} onClick={startEdit}>
                    Editar
                  </Button>
                )}
                <Button size="sm" variant="secondary" disabled={act.busy} onClick={() => act.run(() => editorialApi.decide(id, 'reanalyze', notes || undefined), 'Nova análise pedida: o robô refaz na próxima rodada (usa cota de IA).')}>
                  Pedir nova análise
                </Button>
                <Button size="sm" variant="ghost" disabled={act.busy} onClick={() => act.run(() => editorialApi.decide(id, 'reject', notes || undefined), 'Assunto reprovado: não entra em nenhuma edição.')}>
                  Reprovar
                </Button>
              </>
            )}
          </div>

          {!!data.history.length && (
            <Box title="Histórico de decisões">
              <ul className="space-y-1 text-xs text-slate-400">
                {data.history.map((h, i) => (
                  <li key={i}>
                    {shortDate(h.created_at, true)} · {h.action}
                    {h.notes ? ` · ${h.notes}` : ''}
                  </li>
                ))}
              </ul>
            </Box>
          )}
        </div>
      )}
    </Modal>
  )
}

function AuditPill({ status }: { status: AuditStatus | undefined }) {
  const s = auditLabels[status ?? 'pendente']
  return (
    <Badge tone={s.tone} className="whitespace-nowrap normal-case tracking-normal">
      {s.label}
    </Badge>
  )
}

/** Resultado da auditoria de veracidade: afirmações não sustentadas, trechos citados e decisão do editor. */
function AuditBox({ a, busy, notes, run, compact }: { a: Analysis; busy: boolean; notes: string; run: (fn: () => Promise<Loaded<unknown>>, ok: string) => Promise<void>; compact?: boolean }) {
  const r = a.audit_report
  const flagged = (r?.claims ?? []).filter((c) => c.verdict !== 'apoiada' && !c.field.includes('incorret'))
  const body = (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <AuditPill status={a.audit_status} />
        {r?.summary && (
          <span className="text-xs text-slate-400">
            {r.summary.total} afirmações · {r.summary.apoiada} sustentadas{r.summary.parcial ? ` · ${r.summary.parcial} parciais` : ''}
            {r.summary.sem_suporte ? ` · ${r.summary.sem_suporte} sem suporte` : ''}{r.summary.contradita ? ` · ${r.summary.contradita} contraditas` : ''}
            {a.audit_model ? ` · ${a.audit_model.split('/').pop()}` : ''}
          </span>
        )}
      </div>
      {a.audit_status === 'pendente' && <p className="text-xs text-slate-400">O auditor confere este texto na próxima rodada do robô (e sempre antes do PDF).</p>}
      {!!r?.problems?.length && (
        <ul className="list-disc space-y-1 pl-5 text-amber-100">
          {r.problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
      {!compact && !!flagged.length && (
        <details className="rounded-lg border border-white/10 p-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-slate-400">Afirmações não sustentadas ({flagged.length})</summary>
          <ul className="mt-2 space-y-2 text-xs text-slate-300">
            {flagged.map((c, i) => (
              <li key={i}>
                <b>{verdictLabels[c.verdict]}</b> · {c.field}: {c.claim}
                {c.quote && <span className="block text-slate-500">Trecho citado{c.source ? ` (fonte ${c.source})` : ''}: “{c.quote}”{c.quoteFound ? '' : ' — não encontrado na fonte'}</span>}
                {c.note && <span className="block text-slate-500">{c.note}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="flex flex-wrap gap-2">
        {(a.audit_status === 'reprovada' || a.audit_status === 'erro') && (
          <Button size="sm" variant="secondary" disabled={busy || notes.trim().length < 10} onClick={() => run(() => editorialApi.auditDecide(a.id, 'waive', notes), 'Auditoria dispensada: o texto pode entrar no PDF (decisão registrada).')}>
            Dispensar auditoria
          </Button>
        )}
        {a.audit_status !== 'pendente' && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => editorialApi.auditDecide(a.id, 'reaudit', notes || undefined), 'Texto devolvido à fila do auditor.')}>
            Auditar de novo
          </Button>
        )}
      </div>
      {(a.audit_status === 'reprovada' || a.audit_status === 'erro') && <p className="text-xs text-slate-500">Para dispensar, escreva a justificativa no campo “Observação” abaixo (mín. 10 caracteres). Melhor caminho: corrigir o texto em “Editar” — a nova versão é auditada de novo.</p>}
    </div>
  )
  return compact ? body : <Box title="Auditoria de veracidade" tone={a.audit_status === 'reprovada' || a.audit_status === 'erro' ? 'warn' : undefined}>{body}</Box>
}

function Box({ title, children, tone }: { title: string; children: ReactNode; tone?: 'warn' }) {
  return (
    <section className={cn('rounded-xl border p-4', tone === 'warn' ? 'border-warning-400/30 bg-warning-400/5 text-amber-100' : 'border-white/10 bg-navy-950/40')}>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h4>
      {children}
    </section>
  )
}

/* ================================ Fontes ================================ */

export function SourcesTab() {
  const { data, error, busy, reload } = useLoad<{ rows: SourceRow[] }>(editorialApi.sources)
  const act = useAction(reload)
  const [filter, setFilter] = useState<'ativas' | 'falha' | 'inativas' | 'todas'>('ativas')
  const [creating, setCreating] = useState(false)
  const [notesOf, setNotesOf] = useState<SourceRow | null>(null)
  if (error) return <Alert tone="error">{error}</Alert>
  if (!data) return <Loading />
  const rows = data.rows.filter((s) => (filter === 'ativas' ? s.is_active : filter === 'inativas' ? !s.is_active : filter === 'falha' ? s.is_active && s.consecutive_failures > 0 : true))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1" role="group" aria-label="Filtro">
          {(['ativas', 'falha', 'inativas', 'todas'] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? 'primary' : 'ghost'} onClick={() => setFilter(f)}>
              {f === 'falha' ? 'Com falha' : f[0].toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
            Nova fonte
          </Button>
          <Refresh onClick={reload} busy={busy} />
        </div>
      </div>
      <Feedback msg={act.msg} />
      <Panel>
        <Table head={['Fonte', 'Alcance', 'Modo', 'Confiab.', '7 dias', 'Situação', '']} empty={!rows.length}>
          {rows.map((s) => (
            <tr key={s.id} className="border-t border-white/5">
              <td className={cn(td, 'max-w-xs')}>
                <p className="font-medium text-white">{s.name}</p>
                <p className="truncate text-xs text-slate-500">{s.news_source_groups?.name ?? '—'}{s.is_primary ? ' · oficial' : ''}</p>
              </td>
              <td className={td}>{scopeLabel(s.scope, s.state)}</td>
              <td className={cn(td, 'text-xs')}>{s.source_type === 'sitemap' ? 'Mapa' : s.content_mode === 'summary' ? 'Resumo' : 'Completo'}</td>
              <td className={td}>
                <select
                  aria-label={`Confiabilidade de ${s.name}`}
                  className="rounded-lg border border-white/10 bg-navy-950/60 px-2 py-1 text-sm text-white"
                  value={s.reliability_level}
                  disabled={act.busy}
                  onChange={(e) => act.run(() => editorialApi.updateSource(s.id, { reliability_level: Number(e.target.value) }), `Confiabilidade de ${s.name} atualizada.`)}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </td>
              <td className={cn(td, 'whitespace-nowrap text-xs text-slate-400')}>
                {s.week.ok}/{s.week.runs} ok · {s.week.inserted} novas
              </td>
              <td className={cn(td, 'max-w-[14rem] text-xs')}>
                {!s.is_active ? (
                  <span className="text-slate-500">Inativa</span>
                ) : s.consecutive_failures > 0 ? (
                  <span className="text-warning-400" title={s.last_error ?? ''}>
                    {s.consecutive_failures} falha(s): {s.last_error?.slice(0, 60)}
                  </span>
                ) : (
                  <span className="text-success-400">OK · {shortDate(s.last_success_at, true)}</span>
                )}
              </td>
              <td className={cn(td, 'whitespace-nowrap text-right')}>
                <Button size="sm" variant="ghost" onClick={() => setNotesOf(s)}>
                  Termos
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={act.busy}
                  onClick={() => act.run(() => editorialApi.updateSource(s.id, { is_active: !s.is_active }), `${s.name} ${s.is_active ? 'desativada' : 'ativada'}.`)}
                >
                  {s.is_active ? 'Desativar' : 'Ativar'}
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
      {notesOf && (
        <Modal title={notesOf.name} onClose={() => setNotesOf(null)}>
          <dl className="space-y-3 text-sm">
            <Field label="Feed">{notesOf.feed_url}</Field>
            <Field label="Termos de uso e robots.txt">{notesOf.terms_notes ?? '—'}</Field>
            <Field label="Último erro">{notesOf.last_error ?? '—'}</Field>
          </dl>
        </Modal>
      )}
      {creating && <NewSourceModal onClose={() => setCreating(false)} onCreated={reload} />}
    </div>
  )
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
    <dd className="mt-1 break-words text-slate-200">{children}</dd>
  </div>
)

function NewSourceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [f, setF] = useState<NewSourceInput>({ name: '', feed_url: '', source_type: 'rss', scope: 'nacional', state: 'CE', language: 'pt', reliability_level: 3, is_primary: false, content_mode: 'summary', terms_notes: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = <K extends keyof NewSourceInput>(k: K, v: NewSourceInput[K]) => setF({ ...f, [k]: v })
  async function submit() {
    setBusy(true)
    setErr(null)
    const r = await editorialApi.createSource(f)
    setBusy(false)
    if (r.ok) {
      onCreated()
      onClose()
    } else setErr(r.message)
  }
  const label = 'block text-xs font-semibold uppercase tracking-wider text-slate-400'
  return (
    <Modal title="Nova fonte" onClose={onClose}>
      <div className="space-y-4">
        <Alert tone="info">
          Antes de cadastrar, confira o <strong>robots.txt</strong> e os <strong>termos de uso</strong> do site. Veículos cujos termos proíbem robôs não devem ser cadastrados. Só feed RSS/Atom ou mapa de notícias (nunca a página da matéria); o robô aceita apenas o servidor do próprio feed.
        </Alert>
        {err && <Alert tone="error">{err}</Alert>}
        <label className={label}>
          Nome
          <input className={cn(inputClass, 'mt-1')} value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={120} />
        </label>
        <label className={label}>
          Endereço do feed (https://…)
          <input className={cn(inputClass, 'mt-1')} value={f.feed_url} onChange={(e) => set('feed_url', e.target.value)} placeholder="https://exemplo.com.br/feed/" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            Tipo
            <select className={cn(inputClass, 'mt-1')} value={f.source_type} onChange={(e) => set('source_type', e.target.value as NewSourceInput['source_type'])}>
              <option value="rss">RSS</option>
              <option value="atom">Atom</option>
              <option value="sitemap">Mapa de notícias</option>
            </select>
          </label>
          <label className={label}>
            Alcance
            <select className={cn(inputClass, 'mt-1')} value={f.scope} onChange={(e) => set('scope', e.target.value as NewSourceInput['scope'])}>
              <option value="estadual">Estadual</option>
              <option value="nacional">Nacional</option>
              <option value="internacional">Internacional</option>
            </select>
          </label>
          {f.scope === 'estadual' && (
            <label className={label}>
              UF
              <input className={cn(inputClass, 'mt-1 uppercase')} value={f.state ?? ''} maxLength={2} onChange={(e) => set('state', e.target.value.toUpperCase())} />
            </label>
          )}
          <label className={label}>
            Idioma
            <select className={cn(inputClass, 'mt-1')} value={f.language} onChange={(e) => set('language', e.target.value as NewSourceInput['language'])}>
              <option value="pt">Português</option>
              <option value="en">Inglês</option>
              <option value="es">Espanhol</option>
              <option value="fr">Francês</option>
            </select>
          </label>
          <label className={label}>
            Confiabilidade (1–5)
            <select className={cn(inputClass, 'mt-1')} value={f.reliability_level} onChange={(e) => set('reliability_level', Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={f.is_primary} onChange={(e) => setF({ ...f, is_primary: e.target.checked, content_mode: e.target.checked ? f.content_mode : 'summary' })} />
          Fonte oficial (órgão público que publica os próprios atos)
        </label>
        {f.is_primary && (
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={f.content_mode === 'full'} onChange={(e) => set('content_mode', e.target.checked ? 'full' : 'summary')} />
            Guardar o texto completo do feed (só se a reprodução for permitida)
          </label>
        )}
        <label className={label}>
          O que você verificou (robots.txt e termos de uso)
          <textarea rows={3} className={cn(inputClass, 'mt-1 h-auto py-2 normal-case tracking-normal')} value={f.terms_notes} onChange={(e) => set('terms_notes', e.target.value)} placeholder="Ex.: robots.txt permite /feed; termos lidos em 06/11/2026, sem proibição de robôs." />
        </label>
        <div className="flex gap-2">
          <Button disabled={busy} onClick={submit}>
            {busy ? 'Salvando…' : 'Cadastrar'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ================================= Robô ================================= */

export function RobotTab() {
  const robot = useLoad<Robot>(editorialApi.robot)
  const settings = useLoad<{ rows: SettingRow[] }>(editorialApi.settings)
  if (robot.error) return <Alert tone="error">{robot.error}</Alert>
  if (!robot.data) return <Loading />
  const r = robot.data
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Refresh onClick={() => (robot.reload(), settings.reload())} busy={robot.busy} />
      </div>
      <Panel title="Uso de IA (últimos 7 dias)">
        <Table head={['Dia', 'Chamadas', 'Corrigidas', 'Erros', 'Tokens']} empty={!r.aiByDay.length}>
          {r.aiByDay.map((d) => (
            <tr key={d.day} className="border-t border-white/5">
              <td className={td}>{shortDate(`${d.day}T12:00:00-03:00`)}</td>
              <td className={td}>{d.calls}</td>
              <td className={td}>{d.invalid}</td>
              <td className={cn(td, d.errors ? 'text-warning-400' : '')}>{d.errors}</td>
              <td className={td}>{d.tokens.toLocaleString('pt-BR')}</td>
            </tr>
          ))}
        </Table>
      </Panel>
      <Panel title="Últimas tarefas do robô">
        <Table head={['Quando', 'Etapa', 'Status', 'Detalhe']} empty={!r.jobs.length}>
          {r.jobs.map((j, i) => (
            <tr key={j.id ?? i} className="border-t border-white/5">
              <td className={cn(td, 'whitespace-nowrap text-xs')}>{shortDate(j.created_at, true)}</td>
              <td className={td}>{jobLabels[j.job_type] ?? j.job_type}</td>
              <td className={td}>
                <Badge tone={j.status === 'succeeded' ? 'success' : j.status === 'running' || j.status === 'queued' ? 'brand' : 'warning'} className="normal-case tracking-normal">
                  {{ succeeded: 'ok', failed: 'falhou', dead: 'desistiu', running: 'rodando', queued: 'na fila' }[j.status] ?? j.status}
                </Badge>
              </td>
              <td className={cn(td, 'max-w-md truncate text-xs text-slate-400')} title={j.last_error ?? (j.result as string) ?? ''}>
                {j.last_error ?? (j.result as string) ?? ''}
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
      <Panel title="Falhas de coleta (48h)">
        {!r.fetchErrors.length ? (
          <p className="text-sm text-success-400">Nenhuma falha.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {r.fetchErrors.map((f, i) => (
              <li key={i} className="text-slate-300">
                <span className="text-slate-500">{shortDate(f.created_at, true)}</span> · {f.news_sources.name} · {f.status === 'blocked' ? 'bloqueada (robots.txt)' : f.error}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Configurações">
        {settings.error && <Alert tone="error">{settings.error}</Alert>}
        {!settings.data ? <Loading /> : <SettingsEditor rows={settings.data.rows} onSaved={settings.reload} />}
      </Panel>
    </div>
  )
}

function SettingsEditor({ rows, onSaved }: { rows: SettingRow[]; onSaved: () => void }) {
  const act = useAction(onSaved)
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.key, JSON.stringify(r.value)])))
  return (
    <div className="space-y-4">
      <Feedback msg={act.msg} />
      {rows.map((s) => {
        let parsed: unknown
        let invalid = false
        try {
          parsed = JSON.parse(draft[s.key] ?? 'null')
        } catch {
          invalid = true
        }
        const changed = draft[s.key] !== JSON.stringify(s.value)
        return (
          <div key={s.key} className="rounded-xl border border-white/10 bg-navy-950/40 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium text-white">{s.label}</p>
              <code className="text-xs text-slate-500">{s.key}</code>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">{s.help}</p>
            <div className="mt-2 flex gap-2">
              <input aria-label={s.label} className={cn(inputClass, 'h-9 font-mono text-xs', invalid && 'border-warning-400')} value={draft[s.key] ?? ''} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })} />
              <Button size="sm" variant="secondary" disabled={!changed || invalid || act.busy} onClick={() => act.run(() => editorialApi.updateSetting(s.key, parsed), `${s.label}: salvo.`)}>
                Salvar
              </Button>
            </div>
            {s.updated_at && <p className="mt-1 text-[11px] text-slate-500">Alterado em {shortDate(s.updated_at, true)}</p>}
          </div>
        )
      })}
    </div>
  )
}
