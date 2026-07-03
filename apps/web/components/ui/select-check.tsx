'use client'

import type { MouseEvent } from 'react'
import { useTranslations } from 'next-intl'

/** Kit Radio glyph (visual only) — for rows that manage their own press target. */
export function RadioGlyph({ selected, size }: Readonly<{ selected: boolean; size: number }>) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full shrink-0"
      style={{
        width: size,
        height: size,
        background: selected ? 'var(--primary)' : 'transparent',
        boxShadow: selected ? 'none' : 'inset 0 0 0 2px var(--fg-4)',
      }}
    >
      {selected && (
        <span
          className="rounded-full"
          style={{
            width: Math.round(size * 0.375),
            height: Math.round(size * 0.375),
            background: 'var(--fg-on-primary)',
          }}
        />
      )}
    </span>
  )
}

/** Kit Radio: 24px circle, primary fill + white dot when selected, inset 2px fg-4 ring otherwise. */
interface SelectCheckProps {
  selected: boolean
  size?: number
  onClick?: () => void
  ariaLabel?: string
}

export function SelectCheck({
  selected,
  size = 24,
  onClick,
  ariaLabel,
}: Readonly<SelectCheckProps>) {
  const t = useTranslations('common')

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    onClick?.()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel ?? t('select')}
      aria-pressed={selected}
      className="touch-target appearance-none border-0 bg-transparent cursor-pointer p-0 shrink-0 inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <RadioGlyph selected={selected} size={size} />
    </button>
  )
}

/** Kit RadioRow: radio · Rubik 17 label · optional 12px color dot, hairline divider. */
interface RadioRowProps {
  label: string
  selected: boolean
  /** Optional trailing 12px color dot. */
  dot?: string
  onClick?: () => void
  divider?: boolean
}

export function RadioRow({
  label,
  selected,
  dot,
  onClick,
  divider = true,
}: Readonly<RadioRowProps>) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className="w-full appearance-none bg-transparent cursor-pointer flex items-center text-left"
      style={{
        gap: 16,
        padding: '16px 4px',
        border: 0,
        borderBottomWidth: divider ? 1 : 0,
        borderBottomStyle: 'solid',
        borderBottomColor: 'var(--hairline)',
      }}
    >
      <RadioGlyph selected={selected} size={24} />
      <span
        className="flex-1 min-w-0 overflow-hidden whitespace-nowrap text-ellipsis"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 17,
          fontWeight: 400,
          color: 'var(--fg-1)',
        }}
      >
        {label}
      </span>
      {dot && (
        <span
          aria-hidden="true"
          className="rounded-full shrink-0"
          style={{ width: 12, height: 12, background: dot }}
        />
      )}
    </button>
  )
}
