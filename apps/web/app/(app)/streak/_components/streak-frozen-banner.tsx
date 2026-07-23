'use client'

import { Snowflake } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'

export function StreakFrozenBanner() {
  const t = useTranslations()

  return (
    <div className="px-5" style={{ paddingTop: 16 }}>
      <div
        className="flex items-center rounded-[18px]"
        style={{
          padding: '16px 16px',
          gap: 12,
          background: 'color-mix(in srgb, var(--status-frozen) 10%, transparent)',
          boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--status-frozen) 28%, transparent)',
        }}
      >
        <Snowflake
          size={24}
          strokeWidth={1.9}
          color="var(--status-frozen)"
          aria-hidden="true"
        />
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 16,
            fontWeight: 500,
            color: 'var(--fg-1)',
          }}
        >
          {t('streakDisplay.freeze.activeToday')}
        </span>
      </div>
    </div>
  )
}
