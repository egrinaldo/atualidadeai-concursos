import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { Reveal } from './Reveal'

type SectionHeadingProps = {
  eyebrow: string
  title: string
  highlight?: string
  description?: ReactNode
  align?: 'left' | 'center'
  className?: string
  id?: string
}

/** Cabeçalho padrão das seções: rótulo pequeno + título com trecho destacado. */
export function SectionHeading({
  eyebrow,
  title,
  highlight,
  description,
  align = 'left',
  className,
  id,
}: SectionHeadingProps) {
  return (
    <Reveal className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
      <p className="text-xs font-bold tracking-[0.22em] text-brand-400 uppercase">{eyebrow}</p>
      <h2 id={id} className="mt-3 text-3xl leading-tight font-bold sm:text-4xl lg:text-[2.75rem]">
        {title} {highlight && <span className="text-signal-400">{highlight}</span>}
      </h2>
      {description && <p className="mt-4 text-base leading-relaxed text-slate-400 sm:text-lg">{description}</p>}
    </Reveal>
  )
}
