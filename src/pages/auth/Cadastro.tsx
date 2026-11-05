import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Alert } from '@/components/forms/Alert'
import { Checkbox, PasswordField, SelectField, TextField } from '@/components/forms/Field'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button, Icon } from '@/components/ui'
import { planFeatures, planPriceLabel, plan } from '@/content/plans'
import { UFS } from '@/data/ufs'
import { useMunicipios } from '@/hooks/useMunicipios'
import { resendConfirmation, signUp } from '@/lib/auth'
import { captureLead } from '@/lib/leads'
import {
  normalizeSpaces,
  passwordStrength,
  validateCity,
  validateEmail,
  validateFullName,
  validatePassword,
  validatePasswordConfirmation,
  validateUF,
  type FieldErrors,
} from '@/lib/validation'
import { cn } from '@/utils/cn'

type Form = {
  fullName: string
  email: string
  password: string
  confirmation: string
  state: string
  city: string
  terms: boolean
}
type Key = keyof Form

const empty: Form = { fullName: '', email: '', password: '', confirmation: '', state: '', city: '', terms: false }
const ORDER: Key[] = ['fullName', 'email', 'password', 'confirmation', 'state', 'city', 'terms']
const strengthLabels = ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte'] as const

/** Guarda o plano escolhido na landing para retomar a contratação após o cadastro. */
export const PLAN_INTENT_KEY = 'aai:plano'

export function Cadastro() {
  const [form, setForm] = useState<Form>(empty)
  const [errors, setErrors] = useState<FieldErrors<Key>>({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<{ message: string; code?: string } | null>(null)
  const [doneEmail, setDoneEmail] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const municipios = useMunicipios(form.state)

  useEffect(() => {
    const plano = new URLSearchParams(window.location.search).get('plano')
    try {
      if (plano) sessionStorage.setItem(PLAN_INTENT_KEY, plano)
    } catch {
      /* armazenamento indisponível: ignorar */
    }
  }, [])

  const cityOptions = useMemo(() => municipios.cities.map((c) => ({ value: c, label: c })), [municipios.cities])

  function validate(key: Key, f: Form = form): string | null {
    switch (key) {
      case 'fullName':
        return validateFullName(f.fullName)
      case 'email':
        return validateEmail(f.email)
      case 'password':
        return validatePassword(f.password)
      case 'confirmation':
        return validatePasswordConfirmation(f.password, f.confirmation)
      case 'state':
        return validateUF(f.state)
      case 'city':
        return validateCity(f.city, municipios.status === 'ready' ? municipios.cities : undefined)
      case 'terms':
        return f.terms ? null : 'É necessário aceitar os Termos de Uso e a Política de Privacidade.'
    }
  }

  function set<K extends Key>(key: K, value: Form[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'state') next.city = ''
      // Revalida em tempo real apenas campos que já exibem erro
      setErrors((e) => {
        const ne = { ...e }
        if (e[key]) ne[key] = validate(key, next) ?? undefined
        if (key === 'password' && e.confirmation) ne.confirmation = validate('confirmation', next) ?? undefined
        return ne
      })
      return next
    })
  }

  function blur(key: Key) {
    setErrors((e) => ({ ...e, [key]: validate(key) ?? undefined }))
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    setServerError(null)
    const all: FieldErrors<Key> = {}
    for (const k of ORDER) {
      const msg = validate(k)
      if (msg) all[k] = msg
    }
    setErrors(all)
    const firstInvalid = ORDER.find((k) => all[k])
    if (firstInvalid) {
      const index = ORDER.indexOf(firstInvalid)
      const el = formRef.current?.querySelectorAll<HTMLElement>('input, select')[index]
      el?.focus()
      return
    }

    setSubmitting(true)
    const payload = {
      fullName: normalizeSpaces(form.fullName),
      email: form.email.trim().toLowerCase(),
      password: form.password,
      state: form.state,
      city: normalizeSpaces(form.city),
    }
    const result = await signUp(payload)
    // O lead é registrado mesmo que a confirmação de e-mail não seja concluída,
    // exceto quando o e-mail foi recusado ou já pertence a uma conta.
    if (result.ok || !['email_address_invalid', 'user_already_exists', 'email_exists', 'validation_failed'].includes(result.code ?? '')) {
      await captureLead({ name: payload.fullName, email: payload.email, state: payload.state, city: payload.city })
    }
    setSubmitting(false)

    if (!result.ok) {
      setServerError({ message: result.message, code: result.code })
      return
    }
    setDoneEmail(payload.email)
    window.scrollTo({ top: 0 })
  }

  if (doneEmail) return <ConfirmeSeuEmail email={doneEmail} />

  const strength = passwordStrength(form.password)

  return (
    <AuthLayout
      title="Crie sua conta"
      subtitle={
        <>
          Já tem conta?{' '}
          <a href="/entrar" className="font-semibold text-brand-300 hover:text-white">
            Entrar
          </a>
        </>
      }
      aside={<PlanAside />}
    >
      <form ref={formRef} noValidate onSubmit={onSubmit} className="space-y-5" aria-label="Formulário de cadastro">
        {serverError && (
          <Alert tone="error">
            {serverError.message}
            {serverError.code === 'user_already_exists' && (
              <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <a href="/entrar" className="font-semibold underline">
                  Entrar
                </a>
                <a href="/recuperar-senha" className="font-semibold underline">
                  Recuperar senha
                </a>
              </span>
            )}
          </Alert>
        )}

        <TextField
          label="Nome completo"
          name="name"
          autoComplete="name"
          value={form.fullName}
          onChange={(e) => set('fullName', e.target.value)}
          onBlur={() => blur('fullName')}
          error={errors.fullName}
          maxLength={120}
        />
        <TextField
          label="E-mail"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
          onBlur={() => blur('email')}
          error={errors.email}
          maxLength={254}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <PasswordField
              label="Senha"
              name="new-password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              onBlur={() => blur('password')}
              error={errors.password}
              hint="Mínimo de 8 caracteres, com letras e números."
              maxLength={72}
            />
            {form.password && !errors.password && (
              <div className="mt-2" aria-live="polite">
                <div className="flex gap-1" aria-hidden>
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={cn(
                        'h-1 flex-1 rounded-full',
                        i < strength ? (strength >= 3 ? 'bg-success-400' : 'bg-warning-400') : 'bg-white/10',
                      )}
                    />
                  ))}
                </div>
                <p className="mt-1 text-xs text-slate-400">Força: {strengthLabels[strength]}</p>
              </div>
            )}
          </div>
          <PasswordField
            label="Confirmar senha"
            name="confirm-password"
            autoComplete="new-password"
            value={form.confirmation}
            onChange={(e) => set('confirmation', e.target.value)}
            onBlur={() => blur('confirmation')}
            error={errors.confirmation}
            maxLength={72}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-[0.9fr_1.1fr]">
          <SelectField
            label="Estado"
            name="state"
            autoComplete="address-level1"
            placeholder="Selecione"
            value={form.state}
            options={UFS.map((u) => ({ value: u.sigla, label: `${u.nome} (${u.sigla})` }))}
            onChange={(e) => set('state', e.target.value)}
            onBlur={() => blur('state')}
            error={errors.state}
          />
          {municipios.status === 'error' ? (
            <TextField
              label="Cidade"
              name="city"
              autoComplete="address-level2"
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
              onBlur={() => blur('city')}
              error={errors.city}
              maxLength={120}
            />
          ) : (
            <SelectField
              label="Cidade"
              name="city"
              autoComplete="address-level2"
              placeholder={!form.state ? 'Escolha o estado primeiro' : municipios.status === 'loading' ? 'Carregando…' : 'Selecione'}
              value={form.city}
              options={cityOptions}
              disabled={!form.state || municipios.status !== 'ready'}
              onChange={(e) => set('city', e.target.value)}
              onBlur={() => blur('city')}
              error={errors.city}
            />
          )}
        </div>
        <p className="-mt-2 text-xs text-slate-500">Usados para personalizar as atualidades regionais.</p>

        <Checkbox
          name="terms"
          checked={form.terms}
          onChange={(e) => {
            set('terms', e.target.checked)
            if (e.target.checked) setErrors((er) => ({ ...er, terms: undefined }))
          }}
          error={errors.terms}
        >
          Li e aceito os{' '}
          <a href="/termos" target="_blank" rel="noopener" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            Termos de Uso
          </a>{' '}
          e a{' '}
          <a href="/privacidade" target="_blank" rel="noopener" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            Política de Privacidade
          </a>
          .
        </Checkbox>

        <Button type="submit" size="lg" className="w-full" disabled={submitting} aria-busy={submitting}>
          {submitting ? 'Criando conta…' : 'Criar conta'}
          {!submitting && <Icon name="arrowRight" className="size-4.5" />}
        </Button>

        <p className="text-center text-xs text-slate-500">
          Criar a conta não gera cobrança. A assinatura é contratada em seguida, pelo Mercado Pago.
        </p>
      </form>
    </AuthLayout>
  )
}

function PlanAside() {
  return (
    <div>
      <p className="text-xs font-bold tracking-[0.2em] text-brand-300 uppercase">Sua assinatura</p>
      <p className="mt-3 font-display text-3xl font-bold text-white">{plan.name}</p>
      <p className="mt-1 text-lg text-signal-300">{planPriceLabel()}</p>
      <ul className="mt-6 space-y-3">
        {planFeatures.map((f) => (
          <li key={f} className="flex items-start gap-3 text-sm text-slate-300">
            <Icon name="check" className="mt-0.5 size-4 text-signal-400" />
            {f}
          </li>
        ))}
      </ul>
      <p className="mt-8 flex items-center gap-2 text-xs text-slate-500">
        <Icon name="shield" className="size-4" /> Seus dados são protegidos e nunca compartilhados.
      </p>
    </div>
  )
}

function ConfirmeSeuEmail({ email }: { email: string }) {
  const [cooldown, setCooldown] = useState(60)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function resend() {
    setSending(true)
    const r = await resendConfirmation(email)
    setSending(false)
    setFeedback(r.ok ? { tone: 'success', text: 'E-mail reenviado.' } : { tone: 'error', text: r.message })
    setCooldown(60)
  }

  return (
    <AuthLayout title="Confirme seu e-mail">
      <div className="space-y-5">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-300 ring-1 ring-brand-400/30">
          <Icon name="inbox" className="size-8" />
        </div>
        <p className="text-center text-slate-300">
          Enviamos um link de confirmação para <strong className="break-all text-white">{email}</strong>.
          <br />
          Abra o e-mail e clique no link para ativar sua conta.
        </p>
        <Alert tone="info">
          Não encontrou? Verifique a caixa de spam ou promoções. O link expira em 1 hora. Se este e-mail já tiver uma conta, nenhum
          link novo é enviado: entre normalmente ou use “Esqueci minha senha”.
        </Alert>
        {feedback && <Alert tone={feedback.tone}>{feedback.text}</Alert>}
        <Button variant="secondary" className="w-full" disabled={cooldown > 0 || sending} onClick={resend}>
          {sending ? 'Reenviando…' : cooldown > 0 ? `Reenviar e-mail em ${cooldown}s` : 'Reenviar e-mail'}
        </Button>
        <p className="text-center text-sm text-slate-400">
          Já confirmou?{' '}
          <a href="/entrar" className="font-semibold text-brand-300 hover:text-white">
            Entrar
          </a>
        </p>
      </div>
    </AuthLayout>
  )
}
