'use client'

import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'

interface StreakHeroProps {
  streak: number
  isFrozenToday: boolean
  encouragement: string
}

export function StreakHero({
  streak,
  isFrozenToday,
  encouragement,
}: Readonly<StreakHeroProps>) {
  const t = useTranslations()

  return (
    <div
      className="streak-hero flex flex-col items-center text-center"
      style={{ padding: '28px 20px 24px', gap: 14 }}
    >
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: '0.08em',
          color: isFrozenToday ? 'var(--status-frozen)' : 'var(--fg-3)',
          textTransform: 'uppercase',
        }}
      >
        {isFrozenToday
          ? t('streakDisplay.freeze.activeToday')
          : t('streakDisplay.detail.currentStreak')}
      </span>
      <span
        aria-hidden="true"
        className="flex items-center justify-center rounded-full"
        style={{
          width: 64,
          height: 64,
          background: 'color-mix(in srgb, var(--fg-1) 6%, transparent)',
        }}
      >
        {streak === 0 ? (
          <SatelliteGlyph size={56} />
        ) : (
          <span style={{ fontSize: 30, lineHeight: 1 }}>🔥</span>
        )}
      </span>
      <span className="flex items-baseline justify-center" style={{ gap: 10 }}>
        <span
          className="streak-hero__count"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 64,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1,
            color: 'var(--fg-1)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {streak}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 20,
            fontWeight: 500,
            color: 'var(--fg-2)',
          }}
        >
          {plural(t('streakDisplay.detail.daysUnit', { count: streak }), streak)}
        </span>
      </span>
      {encouragement && (
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            color: 'var(--fg-3)',
          }}
        >
          {encouragement}
        </span>
      )}
    </div>
  )
}
