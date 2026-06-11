'use client'

import type { ReactNode } from 'react'

interface ChipProps {
  children: ReactNode
  active?: boolean
  onClick?: () => void
  leading?: ReactNode
  ariaLabel?: string
}

/** Kit pill chip: bg-elev well with a hairline ring; active fills selection-bg
 *  with a primary ring and primary text. */
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
      className={active ? 'chip chip-active' : 'chip'}
    >
      {leading}
      {children}
    </button>
  )
}
