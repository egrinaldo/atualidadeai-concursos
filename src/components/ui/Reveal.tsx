import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react'
import { cn } from '@/utils/cn'

type RevealProps = {
  as?: ElementType
  className?: string
  /** Atraso em milissegundos (para efeito em cascata). */
  delay?: number
  children: ReactNode
}

/**
 * Exibe o conteúdo com um leve deslizar quando ele entra na tela.
 * Sem IntersectionObserver (navegadores antigos), o conteúdo aparece direto.
 * Usuários com "reduzir movimento" ativado não veem a animação (ver index.css).
 */
export function Reveal({ as: Tag = 'div', className, delay = 0, children }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.1 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <Tag
      ref={ref}
      data-visible={visible}
      className={cn('reveal', className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  )
}
