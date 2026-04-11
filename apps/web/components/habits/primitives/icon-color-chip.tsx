'use client'

import type { CSSProperties } from 'react'
import { resolveHabitIcon } from '@/lib/habit-icon-catalog'

interface IconColorChipProps {
  icon?: string | null
  color: string // resolved accent (already falls back to primary upstream)
  title: string
  size?: number
  className?: string
}

/**
 * Rounded chip that shows either the habit's lucide icon or the title's
 * first letter, both tinted by the user accent color.
 */
export function IconColorChip({
  icon,
  color,
  title,
  size = 40,
  className,
}: Readonly<IconColorChipProps>) {
  const Icon = resolveHabitIcon(icon)
  const style: CSSProperties = {
    width: size,
    height: size,
    background: `${color}24`,
    borderColor: `${color}40`,
  }
  const iconSize = Math.round(size * 0.5)

  return (
    <div
      className={`flex items-center justify-center rounded-2xl border ${className ?? ''}`}
      style={style}
    >
      {Icon ? (
        <Icon style={{ color, width: iconSize, height: iconSize }} />
      ) : (
        <span className="font-bold uppercase" style={{ color, fontSize: iconSize * 0.75 }}>
          {title.charAt(0)}
        </span>
      )}
    </div>
  )
}
