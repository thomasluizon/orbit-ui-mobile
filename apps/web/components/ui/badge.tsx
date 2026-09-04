import type { BadgeProps } from '@orbit/shared/contracts/display'

/** A neutral, static chip. Interactive controls use pill geometry instead. */
export function Badge({ variant = 'solid', children }: Readonly<BadgeProps>) {
  return (
    <span
      className="inline-flex items-center rounded-[8px] uppercase"
      data-variant={variant}
      style={{
        background: variant === 'solid' ? 'var(--fg-1)' : 'transparent',
        boxShadow: variant === 'outline' ? 'inset 0 0 0 1px var(--hairline-strong)' : undefined,
        color: variant === 'solid' ? 'var(--bg)' : 'var(--fg-2)',
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        fontWeight: 500,
        letterSpacing: '0.06em',
        padding: '4px 8px',
        textBox: 'trim-both cap alphabetic',
      }}
    >
      {children}
    </span>
  )
}
