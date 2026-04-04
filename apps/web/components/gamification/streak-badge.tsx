'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'
import './streak-badge.css'

interface StreakBadgeProps {
  streak: number
  isFrozen?: boolean
}

export function StreakBadge({ streak, isFrozen }: StreakBadgeProps) {
  const t = useTranslations()

  const tier = useMemo(() => {
    if (streak >= 100) return 'legendary'
    if (streak >= 30) return 'intense'
    if (streak >= 7) return 'strong'
    return 'normal'
  }, [streak])

  if (streak <= 0) return null

  return (
    <output
      className={`streak-badge streak-badge--${tier}`}
      aria-label={plural(t('streakDisplay.badge.tooltip', { count: streak }), streak)}
    >
      <span className="streak-badge__flame" aria-hidden="true">
        <svg viewBox="0 0 16 20" fill="none" className="streak-badge__flame-svg">
          <path
            d="M8 0C8 0 2 6.5 2 12a6 6 0 0 0 12 0C14 6.5 8 0 8 0Zm0 17a3 3 0 0 1-3-3c0-2 3-5.5 3-5.5S11 12 11 14a3 3 0 0 1-3 3Z"
            fill="url(#flame-grad)"
          />
          <defs>
            <linearGradient id="flame-grad" x1="8" y1="0" x2="8" y2="20" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#fbbf24" />
              <stop offset="0.5" stopColor="#f97316" />
              <stop offset="1" stopColor="#ef4444" />
            </linearGradient>
          </defs>
        </svg>
      </span>
      <span className="streak-badge__count">{streak}</span>
      {isFrozen && (
        <span className="streak-badge__frozen" aria-hidden="true">
          <svg viewBox="0 0 12 14" fill="none" className="size-2.5">
            <path d="M6 0v14M2 2l4 4 4-4M2 12l4-4 4 4M0 7h12" stroke="#93c5fd" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </output>
  )
}
