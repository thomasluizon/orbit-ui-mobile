'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'

interface StreakBadgeProps {
  streak: number
  isFrozen?: boolean
}

/**
 * Kit streak entry point — 40px circled button (inset hairline-strong ring,
 * translucent well) with the 🔥 flame emoji and a tabular count. Frozen state
 * swaps the flame for a snowflake stroked in status-frozen. Tapping navigates
 * to the streak page.
 */
export function StreakBadge({ streak, isFrozen }: Readonly<StreakBadgeProps>) {
  const t = useTranslations()
  const router = useRouter()

  if (streak <= 0) return null

  return (
    <button
      type="button"
      aria-label={plural(t('streakDisplay.badge.tooltip', { count: streak }), streak)}
      onClick={() => router.push('/streak')}
      className="appearance-none border-0 cursor-pointer inline-flex items-center justify-center"
      style={{
        minWidth: 40,
        height: 40,
        borderRadius: 999,
        padding: '0 9px',
        gap: 4,
        background: 'var(--bg-field)',
        boxShadow: 'inset 0 0 0 1.5px var(--hairline-strong)',
      }}
    >
      {isFrozen ? (
        <svg
          width="12"
          height="14"
          viewBox="0 0 12 14"
          fill="none"
          stroke="var(--status-frozen)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 0v14M2 2l4 4 4-4M2 12l4-4 4 4M0 7h12" />
        </svg>
      ) : (
        <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>
          🔥
        </span>
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
