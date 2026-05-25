'use client'

import type { ReactNode } from 'react'

interface ProfileActionButtonProps {
  icon: ReactNode
  label: string
  onClick: () => void
  tone?: 'default' | 'primary' | 'danger'
  compact?: boolean
}

/** v8 flush row action — `danger` tone colors the label red; `compact` renders smaller italic for quieter destructive actions. */
export function ProfileActionButton({
  label,
  onClick,
  tone = 'default',
  compact = false,
}: Readonly<ProfileActionButtonProps>) {
  const color = tone === 'danger' ? 'var(--status-bad)' : 'var(--fg-1)'
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left cursor-pointer"
      style={{
        appearance: 'none',
        border: 0,
        background: 'transparent',
        padding: '14px 20px',
        borderBottom: '1px solid var(--hairline)',
        fontFamily: 'var(--font-family-sans)',
        fontSize: compact ? 13 : 15,
        fontWeight: 400,
        color,
        fontStyle: compact ? 'italic' : 'normal',
      }}
    >
      {label}
    </button>
  )
}
