import { useState, type FormEvent } from 'react'
import { Alert } from '@/components/forms/Alert'
import { PasswordField } from '@/components/forms/Field'
import { Button } from '@/components/ui'
import { deleteMyAccount, downloadJson, exportMyData } from '@/lib/account'
import { signOut } from '@/lib/auth'

/** Exportação e exclusão de dados pessoais (LGPD, art. 18). */
/** onLeaving: avisa a página para não redirecionar ao login quando a sessão terminar. */
export function PrivacyPanel({ onLeaving }: { onLeaving?: () => void }) {
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function onExport() {
    setExporting(true)
    setMessage(null)
    const r = await exportMyData()
    setExporting(false)
    if (!r.ok) return setMessage({ tone: 'error', text: r.message })
    downloadJson(`meus-dados-atualidadeai-${new Date().toISOString().slice(0, 10)}.json`, r.data)
    setMessage({ tone: 'success', text: 'Arquivo com os seus dados gerado.' })
  }

  async function onDelete(ev: FormEvent) {
    ev.preventDefault()
    if (!password) return setMessage({ tone: 'error', text: 'Informe sua senha para confirmar.' })
    setDeleting(true)
    setMessage(null)
    const r = await deleteMyAccount(password)
    if (!r.ok) {
      setDeleting(false)
      return setMessage({ tone: 'error', text: r.message })
    }
    onLeaving?.()
    // A conta já não existe no servidor: encerra só a sessão local
    await signOut('local').catch(() => null)
    window.location.replace('/?conta=excluida')
  }

  return (
    <section aria-labelledby="privacidade-title" className="space-y-3">
      <h2 id="privacidade-title" className="text-base font-semibold">
        Privacidade e dados
      </h2>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div className="space-y-3 rounded-2xl border border-white/10 p-4 text-sm">
        <p className="text-slate-400">Você pode baixar uma cópia dos seus dados ou excluir sua conta a qualquer momento.</p>
        <Button variant="secondary" size="sm" className="w-full" onClick={onExport} disabled={exporting}>
          {exporting ? 'Gerando arquivo…' : 'Baixar meus dados'}
        </Button>
        {!confirming ? (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setConfirming(true)}>
            Excluir minha conta
          </Button>
        ) : (
          <form onSubmit={onDelete} noValidate className="space-y-3 rounded-xl border border-danger-400/40 bg-danger-400/5 p-3">
            <p className="text-red-100">
              A exclusão é definitiva: cancela sua assinatura (sem novas cobranças) e apaga seus dados pessoais. Os registros de pagamento
              são mantidos sem identificação, por obrigação legal.
            </p>
            <PasswordField label="Sua senha" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={deleting}
                className="inline-flex h-9 flex-1 items-center justify-center rounded-xl bg-danger-400 px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {deleting ? 'Excluindo…' : 'Excluir definitivamente'}
              </button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={deleting}>
                Voltar
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  )
}
