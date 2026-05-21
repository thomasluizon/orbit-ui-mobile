'use client'

import type { MouseEvent } from 'react'

/** 18px primary-filled checkbox used in select-mode rows. */
interface SelectCheckProps {
  selected: boolean
  size?: number
  onClick?: () => void
  ariaLabel?: string
}

export function SelectCheck({
  selected,
  size = 18,
  onClick,
  ariaLabel,
}: Readonly<SelectCheckProps>) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    onClick?.()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel ?? 'select'}
      aria-pressed={selected}
      className="appearance-none border-0 bg-transparent cursor-pointer p-0 shrink-0 inline-flex items-center justify-center"
      style={{ width: 20, height: 20 }}
    >
      {selected ? (
        <div
          className="flex items-center justify-center"
          style={{
            width: size,
            height: size,
            borderRadius: 4,
            background: 'var(--primary)',
          }}
        >
          <svg
            width={size * 0.62}
            height={size * 0.62}
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--fg-on-primary)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      ) : (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: 4,
            boxShadow: 'inset 0 0 0 1.5px var(--hairline-strong)',
          }}
        />
      )}
    </button>
  )
}
