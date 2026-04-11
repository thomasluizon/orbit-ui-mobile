'use client'

import { Flame } from 'lucide-react'

interface StreakFlameMiniProps {
  streak: number
}

/**
 * Compact streak flame for habit cards. Only renders when streak >= 2.
 * Tier progression matches the main StreakBadge thresholds.
 */
export function StreakFlameMini({ streak }: Readonly<StreakFlameMiniProps>) {
  if (streak < 2) return null

  let flameColor = 'text-amber-400'
  let bgColor = 'bg-amber-400/10'
  let borderColor = 'border-amber-400/10'

  if (streak >= 100) {
    flameColor = 'text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]'
    bgColor = 'bg-gradient-to-br from-amber-400/15 to-red-500/10'
    borderColor = 'border-amber-300/30'
  } else if (streak >= 30) {
    flameColor = 'text-orange-400 drop-shadow-[0_0_4px_rgba(249,115,22,0.4)]'
    bgColor = 'bg-orange-500/10'
    borderColor = 'border-orange-400/20'
  } else if (streak >= 7) {
    flameColor = 'text-orange-400'
    bgColor = 'bg-orange-500/10'
    borderColor = 'border-orange-400/15'
  }

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${flameColor} ${bgColor} ${borderColor}`}
      aria-label={`${streak} day streak`}
    >
      <Flame className="size-3" />
      {streak}
    </span>
  )
}
