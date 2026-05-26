'use client'

import type { ReactNode } from 'react'

/** Hairline-ringed text chip. Active variant fills bg-elev with stronger ring; no underline. */
interface ChipProps {
  children: ReactNode
  active?: boolean
  onClick?: () => void
  leading?: ReactNode
  ariaLabel?: string
}

export function Chip({
  children,
  active = false,
  onClick,
  leading,
  ariaLabel,
}: Readonly<ChipProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={
        'appearance-none border-0 cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-[background-color,color,box-shadow] duration-150 ease-out ' +
        (active
          ? 'bg-[var(--bg-elev)] text-[var(--fg-1)]'
          : 'bg-transparent text-[var(--fg-2)] hover:bg-[var(--bg-elev)] hover:text-[var(--fg-1)]')
      }
      style={{
        height: 26,
        padding: '0 9px',
        borderRadius: 6,
        boxShadow: active
          ? 'inset 0 0 0 1px var(--fg-3)'
          : 'inset 0 0 0 1px var(--hairline-strong)',
        fontFamily: 'var(--font-family-sans)',
        fontSize: 12,
        fontWeight: active ? 600 : 500,
      }}
    >
      {leading}
      {children}
    </button>
  )
}
