'use client'

import type { ReactNode } from 'react'

interface ChipProps {
  children: ReactNode
  active?: boolean
  onClick?: () => void
  leading?: ReactNode
  ariaLabel?: string
}

/** Pill filter chip: active fills bg-elev with fg-1 text; inactive is a transparent hairline-ringed ghost. */
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
        'appearance-none border-0 cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-[background-color,color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-standard)] ' +
        (active
          ? 'bg-[var(--bg-elev)] text-[var(--fg-1)]'
          : 'bg-transparent text-[var(--fg-3)] hover:bg-[var(--bg-elev)] hover:text-[var(--fg-1)]')
      }
      style={{
        height: 30,
        padding: '0 14px',
        borderRadius: 999,
        boxShadow: active ? undefined : 'inset 0 0 0 1px var(--hairline)',
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      {leading}
      {children}
    </button>
  )
}
