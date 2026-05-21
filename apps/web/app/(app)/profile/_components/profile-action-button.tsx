'use client'

import type { ReactNode } from 'react'

interface ProfileActionButtonProps {
  icon: ReactNode
  label: string
  onClick: () => void
  tone?: 'default' | 'primary' | 'danger'
  compact?: boolean
}

/** v8 flush row action — italic destructive label (no red text), plain otherwise. */
export function ProfileActionButton({
  label,
  onClick,
  tone = 'default',
  compact = false,
}: Readonly<ProfileActionButtonProps>) {
  const isDestructive = tone === 'danger'
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
        fontSize: compact ? 14 : 15,
        fontWeight: 400,
        color: 'var(--fg-1)',
        fontStyle: isDestructive ? 'italic' : 'normal',
        opacity: compact ? 0.78 : 1,
      }}
    >
      {label}
    </button>
  )
}
