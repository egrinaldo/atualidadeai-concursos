import { useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { Icon } from '@/components/ui'
import { cn } from '@/utils/cn'

const control =
  'w-full rounded-xl border bg-navy-950/60 px-4 text-[0.95rem] text-white placeholder:text-slate-500 ' +
  'transition-colors outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/30 ' +
  'disabled:cursor-not-allowed disabled:opacity-60'

function stateClass(error?: string) {
  return error ? 'border-danger-400/70' : 'border-white/12 hover:border-white/20'
}

type WrapperProps = {
  id: string
  label: string
  error?: string
  hint?: ReactNode
  children: ReactNode
}

function FieldWrapper({ id, label, error, hint, children }: WrapperProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-200">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-erro`} className="mt-1.5 flex items-start gap-1.5 text-sm text-danger-400" role="alert">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-dica`} className="mt-1.5 text-xs text-slate-500">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

function describedBy(id: string, error?: string, hint?: ReactNode) {
  return error ? `${id}-erro` : hint ? `${id}-dica` : undefined
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string
  error?: string
  hint?: ReactNode
}

export function TextField({ label, error, hint, className, ...rest }: TextFieldProps) {
  const id = useId()
  return (
    <FieldWrapper id={id} label={label} error={error} hint={hint}>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(id, error, hint)}
        className={cn(control, 'h-12', stateClass(error), className)}
        {...rest}
      />
    </FieldWrapper>
  )
}

export function PasswordField({ label, error, hint, className, ...rest }: TextFieldProps) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  return (
    <FieldWrapper id={id} label={label} error={error} hint={hint}>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy(id, error, hint)}
          className={cn(control, 'h-12 pr-20', stateClass(error), className)}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-1.5 my-1.5 rounded-lg px-3 text-xs font-semibold text-brand-300 hover:bg-white/5 hover:text-white"
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visible}
        >
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
    </FieldWrapper>
  )
}

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  label: string
  error?: string
  hint?: ReactNode
  placeholder: string
  options: { value: string; label: string }[]
}

export function SelectField({ label, error, hint, placeholder, options, className, ...rest }: SelectFieldProps) {
  const id = useId()
  return (
    <FieldWrapper id={id} label={label} error={error} hint={hint}>
      <div className="relative">
        <select
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy(id, error, hint)}
          className={cn(control, 'h-12 appearance-none pr-10', stateClass(error), !rest.value && 'text-slate-500', className)}
          {...rest}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-navy-900 text-white">
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-slate-400" />
      </div>
    </FieldWrapper>
  )
}

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> & {
  children: ReactNode
  error?: string
}

export function Checkbox({ children, error, ...rest }: CheckboxProps) {
  const id = useId()
  return (
    <div>
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-erro` : undefined}
          className="mt-0.5 size-5 shrink-0 cursor-pointer rounded border-white/20 bg-navy-950 accent-brand-500"
          {...rest}
        />
        <label htmlFor={id} className="cursor-pointer text-sm leading-relaxed text-slate-300">
          {children}
        </label>
      </div>
      {error && (
        <p id={`${id}-erro`} className="mt-1.5 ml-8 text-sm text-danger-400" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
