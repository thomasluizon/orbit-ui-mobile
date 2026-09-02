'use client'

import type { CSSProperties, Ref } from 'react'
import { useTranslations } from 'next-intl'
import type { Recap } from '@orbit/shared/types/gamification'
import { buildShareCardStats, recapPeriodLabelKey } from '@orbit/shared/utils'
import { StatTile } from '@/components/ui/stat-tile'
import { OrbitMark } from '@/components/ui/orbit-mark'
import { ShareCardQr } from './share-card-qr'

const weeklyBarsStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: 4,
  alignItems: 'end',
  height: 64,
  padding: 12,
  borderRadius: 16,
  background: 'var(--bg-card)',
  boxShadow: 'inset 0 0 0 1px var(--hairline)',
}

const topHabitChipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 8px',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--fg-2)',
  background: 'var(--bg-field)',
  boxShadow: 'inset 0 0 0 1px var(--hairline)',
}

const WEEKDAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

interface ShareCardProps {
  recap: Recap
  displayName?: string
  ref?: Ref<HTMLDivElement>
}

/** Flat token-native recap card and the html-to-image capture target. */
export function ShareCard({ recap, displayName, ref }: Readonly<ShareCardProps>) {
  const t = useTranslations()
  const { metrics, shareDeepLink } = recap
  const stats = buildShareCardStats(metrics)
  const topHabits = metrics.topHabits.slice(0, 3)
  const shortLink = shareDeepLink.replace(/^https?:\/\//, '')
  const eyebrow = [displayName, t(recapPeriodLabelKey(recap.period))]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      ref={ref}
      data-testid="share-card"
      style={{
        width: 360,
        background: 'var(--bg)',
        borderRadius: 20,
        overflow: 'hidden',
        boxShadow: 'inset 0 0 0 1px var(--hairline)',
        fontFamily: 'var(--font-sans)',
        color: 'var(--fg-1)',
      }}
    >
      <div style={{ position: 'relative', padding: 24, background: 'var(--bg-card)' }}>
        <div className="flex items-center" style={{ gap: 8 }}>
          <OrbitMark size={24} accent />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>
            Orbit
          </span>
        </div>
        <p style={{ marginTop: 16, fontSize: 12, fontWeight: 500, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {eyebrow}
        </p>
        <p
          data-testid="share-card-streak"
          style={{ marginTop: 4, fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}
        >
          {t('shareCard.streak', { count: metrics.currentStreak })} 🔥
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {stats.map((stat) => (
            <StatTile key={stat.labelKey}  value={stat.value} label={t(stat.labelKey)} />
          ))}
        </div>

        <div style={weeklyBarsStyle}>
          {metrics.weeklyConsistency.slice(0, 7).map((value, index) => {
            const clamped = Math.max(0, Math.min(100, value))
            const barLabel = t('retrospective.weeklyBarLabel', {
              day: t(`dates.daysShort.${WEEKDAY_KEYS[index]!}`),
              percent: Math.round(clamped),
            })
            return (
              <div
                key={WEEKDAY_KEYS[index]}
                role="img"
                aria-label={barLabel}
                title={barLabel}
                style={{
                  height: `${Math.max(4, (clamped / 100) * 48)}px`,
                  borderRadius: 4,
                  background: 'var(--primary)',
                  opacity: clamped === 0 ? 0.25 : 1,
                }}
              />
            )
          })}
        </div>

        {topHabits.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--fg-3)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              {t('shareCard.stats.topHabits')}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {topHabits.map((habit) => (
                <span key={habit.name} style={topHabitChipStyle}>
                  <span aria-hidden="true">{habit.emoji ?? '•'}</span>
                  {habit.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {shareDeepLink && (
        <div
          className="flex items-center"
          style={{ gap: 12, padding: 16, borderTop: '1px solid var(--hairline)' }}
        >
          <div style={{ padding: 4, borderRadius: 12, background: '#ffffff', lineHeight: 0 }}>
            <ShareCardQr value={shareDeepLink} size={56} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-1)' }}>{t('shareCard.scanToJoin')}</p>
            <p
              className="truncate"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.02em', color: 'var(--fg-3)' }}
            >
              {shortLink}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
