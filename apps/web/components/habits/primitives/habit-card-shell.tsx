'use client'

import type { CSSProperties, ReactNode } from 'react'
import type { HabitCardStatus } from '@orbit/shared/utils'

interface HabitCardShellProps {
  accentBar: string
  status: HabitCardStatus
  isSelected?: boolean
  isChild?: boolean
  depth?: number
  dimmed?: boolean
  justCompleted?: boolean
  justCreated?: boolean
  onPress?: () => void
  onLongPress?: () => void
  children: ReactNode
  ariaLabel?: string
}

/**
 * Pressable card container with the left accent bar, shadow, and state
 * styling. Extracted so both parent and child rows share the same shell.
 */
export function HabitCardShell({
  accentBar,
  status,
  isSelected,
  isChild,
  depth = 0,
  dimmed,
  justCompleted,
  justCreated,
  onPress,
  onLongPress,
  children,
  ariaLabel,
}: Readonly<HabitCardShellProps>) {
  const style: CSSProperties = {
    marginLeft: isChild ? `${depth * 1.5}rem` : undefined,
  }

  const barColor = status === 'completed' ? `${accentBar}4D` : accentBar

  const baseClasses = isChild
    ? 'group relative overflow-hidden rounded-xl border border-border-muted bg-surface py-3 px-3.5 transition-all'
    : 'group relative overflow-hidden rounded-2xl border border-border-muted bg-surface p-4 sm:p-5 shadow-sm transition-all'

  const stateClasses = [
    dimmed ? 'opacity-40' : '',
    isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background border-primary/40' : '',
    justCompleted ? 'animate-complete-glow' : '',
    justCreated ? 'animate-creation-glow' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <article
      className={`${baseClasses} ${stateClasses} ${onPress ? 'cursor-pointer hover:border-border-emphasis' : ''}`}
      style={style}
      aria-label={ariaLabel}
      onClick={onPress}
      onContextMenu={(event) => {
        if (onLongPress) {
          event.preventDefault()
          onLongPress()
        }
      }}
    >
      {!isSelected && (
        <span
          aria-hidden
          className="absolute left-0 top-0 h-full w-1 rounded-l-2xl"
          style={{ background: barColor }}
        />
      )}
      <div className={isChild ? '' : 'pl-2'}>{children}</div>
    </article>
  )
}
