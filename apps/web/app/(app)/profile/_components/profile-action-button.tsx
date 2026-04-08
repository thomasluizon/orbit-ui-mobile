'use client'

import type { ReactNode } from 'react'

interface ProfileActionButtonProps {
  icon: ReactNode
  label: string
  onClick: () => void
  tone?: 'default' | 'primary' | 'danger'
  compact?: boolean
}

export function ProfileActionButton({
  icon,
  label,
  onClick,
  tone = 'default',
  compact = false,
}: ProfileActionButtonProps) {
  const baseClass =
    'w-full rounded-[var(--radius-xl)] font-bold transition-all duration-200 flex items-center justify-center gap-2'

  const toneClass =
    tone === 'danger'
      ? compact
        ? 'py-3.5 text-red-500/60 text-xs hover:text-red-400'
        : 'py-4 border border-red-500/30 text-red-400 hover:bg-red-500/10'
      : tone === 'primary'
        ? 'py-4 border border-primary/30 text-primary hover:bg-primary/10'
        : 'py-4 border border-border-muted text-text-primary hover:bg-surface-elevated'

  const iconSizeClass = compact ? 'size-3.5' : 'size-4'

  return (
    <button type="button" className={`${baseClass} ${toneClass}`} onClick={onClick}>
      <span className={iconSizeClass}>{icon}</span>
      {label}
    </button>
  )
}
