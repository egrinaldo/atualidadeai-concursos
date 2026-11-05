import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/utils/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'light'
type Size = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 ' +
  'disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap'

const variants: Record<Variant, string> = {
  primary: 'bg-brand-500 text-white shadow-glow hover:bg-brand-400 hover:-translate-y-0.5 active:translate-y-0',
  secondary: 'border border-brand-400/40 bg-navy-800/60 text-brand-200 hover:border-brand-300 hover:text-white',
  ghost: 'text-slate-300 hover:text-white hover:bg-white/5',
  /** Para fundos coloridos (ex.: faixa de CTA azul). */
  light: 'bg-white text-navy-950 hover:bg-signal-300 hover:-translate-y-0.5 active:translate-y-0',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-13 px-7 text-base',
}

type CommonProps = {
  variant?: Variant
  size?: Size
  children: ReactNode
  className?: string
}

type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined }
type LinkProps = CommonProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }

/**
 * Botão padrão do sistema. Renderiza <a> quando recebe `href`,
 * e <button> nos demais casos.
 */
export function Button(props: ButtonProps | LinkProps) {
  const { variant = 'primary', size = 'md', className, children, ...rest } = props
  const classes = cn(base, variants[variant], sizes[size], className)

  if (typeof rest.href === 'string') {
    return (
      <a className={classes} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </a>
    )
  }

  const buttonProps = rest as ButtonHTMLAttributes<HTMLButtonElement>
  return (
    <button type={buttonProps.type ?? 'button'} className={classes} {...buttonProps}>
      {children}
    </button>
  )
}
