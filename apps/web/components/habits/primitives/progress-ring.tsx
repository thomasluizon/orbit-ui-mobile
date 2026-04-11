'use client'

import { Check } from 'lucide-react'
import type { CSSProperties } from 'react'

interface ProgressRingProps {
  progress: number // 0..1
  size?: number
  strokeWidth?: number
  color: string
  trackColor?: string
  done?: boolean
  children?: React.ReactNode
}

const SIZE = 36
const DEFAULT_RADIUS = 15
const CIRCUMFERENCE = 2 * Math.PI * DEFAULT_RADIUS // ≈ 94.25

/**
 * Circular progress ring for parent habit cards. Animates stroke-dasharray
 * over 400ms on prop changes and shows a checkmark when done.
 */
export function ProgressRing({
  progress,
  size = 36,
  strokeWidth = 3,
  color,
  trackColor,
  done = false,
  children,
}: Readonly<ProgressRingProps>) {
  const clamped = Math.max(0, Math.min(1, progress))
  const dashLength = done ? CIRCUMFERENCE : clamped * CIRCUMFERENCE

  const style: CSSProperties = {
    transition: 'stroke-dasharray 400ms cubic-bezier(0.16, 1, 0.3, 1), stroke 300ms ease-out',
  }

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg className="-rotate-90" width={size} height={size} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={DEFAULT_RADIUS}
          fill="none"
          stroke={trackColor ?? 'currentColor'}
          strokeWidth={strokeWidth}
          className={trackColor ? '' : 'text-border-muted'}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={DEFAULT_RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dashLength} ${CIRCUMFERENCE}`}
          style={style}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-text-primary">
        {done ? <Check className="size-4" style={{ color }} /> : children}
      </span>
    </div>
  )
}
