import type { ElementType, ReactNode } from 'react'
import { cn } from '@/utils/cn'

type ContainerProps = {
  as?: ElementType
  className?: string
  children: ReactNode
}

/** Limita a largura do conteúdo e aplica margens laterais responsivas. */
export function Container({ as: Tag = 'div', className, children }: ContainerProps) {
  return <Tag className={cn('mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8', className)}>{children}</Tag>
}
