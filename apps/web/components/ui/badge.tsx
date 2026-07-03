import type { CSSProperties, ReactNode } from 'react'

export type BadgeTone = 'violet' | 'soft' | 'outline' | 'amber' | 'bad'

interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
  className?: string
}

const toneStyles: Record<BadgeTone, CSSProperties> = {
  violet: { background: 'var(--primary)', color: 'var(--fg-on-primary)' },
  soft: {
    background: 'rgba(var(--primary-rgb), 0.18)',
    color: 'var(--primary-soft)',
  },
  outline: {
    background: 'transparent',
    color: 'var(--fg-2)',
    boxShadow: 'inset 0 0 0 1px var(--hairline-strong)',
  },
  amber: {
    background: 'color-mix(in srgb, var(--status-overdue) 18%, transparent)',
    color: 'var(--status-overdue-text)',
  },
  bad: {
    background: 'color-mix(in srgb, var(--status-bad) 18%, transparent)',
    color: 'var(--status-bad-text)',
  },
}

/** Kit badge: 10.5/600 uppercase pill in violet, soft, outline, amber, or bad tone. */
export function Badge({ tone = 'violet', children, className }: Readonly<BadgeProps>) {
  return (
    <span
      className={['inline-flex items-center rounded-full uppercase', className]
        .filter(Boolean)
        .join(' ')}
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '0.06em',
        padding: '3px 9px',
        ...toneStyles[tone],
      }}
    >
      {children}
    </span>
  )
}
