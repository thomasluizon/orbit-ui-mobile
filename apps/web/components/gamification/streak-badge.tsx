'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'

interface StreakBadgeProps {
  streak: number
  isFrozen?: boolean
}

/**
 * v8 streak badge — outline flame + tabular streak count in a hairline pill.
 * No orange gradient, no semantic "tiers". Stroke color is status-bad for an
 * active streak, fg-3 otherwise. Frozen state swaps the icon for a snowflake.
 * Tapping the badge navigates to the streak page.
 */
export function StreakBadge({ streak, isFrozen }: Readonly<StreakBadgeProps>) {
  const t = useTranslations()
  const router = useRouter()

  if (streak <= 0) return null

  const active = streak >= 2
  const strokeColor = isFrozen
    ? 'var(--status-frozen)'
    : active
      ? 'var(--status-bad)'
      : 'var(--fg-3)'

  return (
    <button
      type="button"
      aria-label={plural(t('streakDisplay.badge.tooltip', { count: streak }), streak)}
      onClick={() => router.push('/streak')}
      className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center"
      style={{
        boxShadow: 'inset 0 0 0 1px var(--hairline-strong)',
        borderRadius: 6,
        padding: '0 7px',
        height: 24,
        gap: 5,
      }}
    >
      {isFrozen ? (
        <svg
          width="11"
          height="12"
          viewBox="0 0 12 14"
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 0v14M2 2l4 4 4-4M2 12l4-4 4 4M0 7h12" />
        </svg>
      ) : (
        <svg
          width="11"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
      )}
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--fg-1)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {streak}
      </span>
    </button>
  )
}
