import { useEffect, useState } from 'react'
import { Alert } from '@/components/forms/Alert'
import { Button } from '@/components/ui'
import { ufName } from '@/data/ufs'
import { myDocuments, myDocumentUrl, type MyDocument } from '@/lib/account'

const TYPE: Record<MyDocument['edition_type'], string> = { diaria: 'Informativo diário', semanal: 'Revisão semanal', mensal: 'Revisão mensal' }
const dateBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`

/** Informativos do assinante: cópias com nome e e-mail, disponíveis por 7 dias (o link de download dura 2 min). */
export function DocumentsPanel() {
  const [docs, setDocs] = useState<MyDocument[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    myDocuments().then((r) => (r.ok ? setDocs(r.data.documents) : setError(r.message)))
  }, [])

  async function download(id: string) {
    setBusy(id)
    setError(null)
    const r = await myDocumentUrl(id)
    setBusy(null)
    if (!r.ok) return setError(r.message)
    window.location.assign(r.data.url)
  }

  return (
    <section aria-labelledby="informativos-title" className="space-y-3">
      <h2 id="informativos-title" className="text-base font-semibold">
        Meus informativos
      </h2>
      {error && <Alert tone="error">{error}</Alert>}
      {!docs && !error && (
        <p className="text-sm text-slate-400" role="status">
          Carregando…
        </p>
      )}
      {docs && !docs.length && (
        <p className="rounded-2xl border border-white/10 p-4 text-sm text-slate-400">
          Seus informativos aparecem aqui todos os dias às 6h, com assinatura ativa e o estado preenchido em seus dados.
        </p>
      )}
      {!!docs?.length && (
        <ul className="divide-y divide-white/8 rounded-2xl border border-white/10 text-sm">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="font-medium text-slate-100">
                  {TYPE[d.edition_type]} · {dateBR(d.reference_date)}
                </p>
                <p className="text-xs text-slate-400">
                  {ufName(d.state)}
                  {d.pages ? ` · ${d.pages} páginas` : ''}
                </p>
              </div>
              {d.available ? (
                <Button size="sm" variant="secondary" disabled={busy === d.id} onClick={() => download(d.id)}>
                  {busy === d.id ? 'Abrindo…' : 'Baixar PDF'}
                </Button>
              ) : (
                <span className="text-xs text-slate-500">Expirado (7 dias)</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {!!docs?.length && <p className="text-xs text-slate-500">O PDF traz seu nome e e-mail: é para uso pessoal e intransferível.</p>}
    </section>
  )
}
