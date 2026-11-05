import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

/**
 * Conjunto de ícones próprios (SVG inline, traço de 1.75px, grade 24×24).
 * Evita dependência externa e mantém o estilo consistente.
 * Para adicionar um ícone, inclua uma nova entrada em `paths`.
 */
const paths = {
  newspaper: (
    <>
      <path d="M4 5h12v14H6a2 2 0 0 1-2-2V5Z" />
      <path d="M16 9h4v8a2 2 0 0 1-2 2h-2" />
      <path d="M7.5 9h5M7.5 12.5h5M7.5 16h3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" />
    </>
  ),
  mapPin: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3.5 8.5 4.5L12 12.5 3.5 8 12 3.5Z" />
      <path d="m3.5 12 8.5 4.5 8.5-4.5" />
      <path d="m3.5 16 8.5 4.5 8.5-4.5" />
    </>
  ),
  filter: <path d="M4 5h16l-6.2 7.3V18l-3.6 1.8v-7.5L4 5Z" />,
  sparkles: (
    <>
      <path d="M11 3.5 12.6 8l4.4 1.6-4.4 1.6L11 15.7l-1.6-4.5L5 9.6 9.4 8 11 3.5Z" />
      <path d="M18 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
    </>
  ),
  fileText: (
    <>
      <path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8L14 3.5Z" />
      <path d="M14 3.5V8h4.5M9 12.5h6M9 16h4" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  calendarRange: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4M8 14h8M8 17h5" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  chevronDown: <path d="m6 9.5 6 6 6-6" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5S9.6 5.9 12 3.5Z" />
    </>
  ),
  flag: (
    <>
      <path d="M5.5 20.5v-16" />
      <path d="M5.5 4.5h11l-2.2 4 2.2 4h-11" />
    </>
  ),
  building: (
    <>
      <path d="M4 20.5h16M6 20.5V9l6-4.5 6 4.5v11.5" />
      <path d="M9.5 20.5v-4.5h5v4.5M9.5 11.5h.01M14.5 11.5h.01" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 19 6v5.5c0 4.4-3 7.9-7 9-4-1.1-7-4.6-7-9V6l7-2.5Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.4-4.4" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 13.5 6.5 5h11L20 13.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-5.5Z" />
      <path d="M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20" />
    </>
  ),
  brain: (
    <>
      <path d="M9 4.5a3 3 0 0 0-3 3v.3A3 3 0 0 0 4.5 13a3 3 0 0 0 2 4.6A3 3 0 0 0 12 18.5v-12A3 3 0 0 0 9 4.5Z" />
      <path d="M15 4.5a3 3 0 0 1 3 3v.3a3 3 0 0 1 1.5 5.2 3 3 0 0 1-2 4.6 3 3 0 0 1-5.5.9" />
      <path d="M12 9.5h-2M12 13.5h2.5" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M9 17.5h6M10 20.5h4" />
      <path d="M12 3.5a5.5 5.5 0 0 0-3.2 10c.7.5 1.2 1.3 1.2 2.2v1.8h4v-1.8c0-.9.5-1.7 1.2-2.2A5.5 5.5 0 0 0 12 3.5Z" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof paths

type IconProps = {
  name: IconName
  className?: string
  title?: string
}

export function Icon({ name, className, title }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('size-5 shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {paths[name]}
    </svg>
  )
}
