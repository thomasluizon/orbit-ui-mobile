'use client'

import { forwardRef } from 'react'
import { useTranslations } from 'next-intl'
import type { Recap } from '@orbit/shared/types/gamification'
import { buildShareCardStats, recapPeriodLabelKey } from '@orbit/shared/utils'
import { StatTile } from '@/components/ui/stat-tile'
import { ShareCardQr } from './share-card-qr'

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
}

/** Branded navy-violet recap card and the html-to-image capture target. Reused by share + Wrapped (#198) surfaces. */
export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(function ShareCard(
  { recap, displayName },
  ref,
) {
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
        borderRadius: 24,
        overflow: 'hidden',
        boxShadow: 'inset 0 0 0 1px var(--hairline)',
        fontFamily: 'var(--font-sans)',
        color: 'var(--fg-1)',
      }}
    >
      <div style={{ position: 'relative', padding: '20px 22px 22px', background: 'var(--gradient-header)' }}>
        <div className="flex items-center" style={{ gap: 9 }}>
          <div
            aria-hidden="true"
            style={{
              width: 26,
              height: 26,
              backgroundImage: 'url(/logo-no-bg.png)',
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
            }}
          />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>
            Orbit
          </span>
        </div>
        <p style={{ marginTop: 16, fontSize: 12, fontWeight: 500, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {eyebrow}
        </p>
        <p
          data-testid="share-card-streak"
          style={{ marginTop: 4, fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em' }}
        >
          {t('shareCard.streak', { count: metrics.currentStreak })} 🔥
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 18px 18px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {stats.map((stat) => (
            <StatTile key={stat.labelKey} emoji={stat.emoji} value={stat.value} label={t(stat.labelKey)} />
          ))}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 6,
            alignItems: 'end',
            height: 64,
            padding: '10px 14px',
            borderRadius: 18,
            background: 'var(--bg-card)',
            boxShadow: 'inset 0 0 0 1px var(--hairline)',
          }}
        >
          {metrics.weeklyConsistency.slice(0, 7).map((value, index) => {
            const clamped = Math.max(0, Math.min(100, value))
            return (
              <div
                key={WEEKDAY_KEYS[index]}
                aria-hidden="true"
                style={{
                  height: `${Math.max(6, (clamped / 100) * 44)}px`,
                  borderRadius: 5,
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
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--fg-3)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {t('shareCard.stats.topHabits')}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {topHabits.map((habit) => (
                <span
                  key={habit.name}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 10px',
                    borderRadius: 999,
                    fontSize: 12.5,
                    color: 'var(--fg-2)',
                    background: 'var(--bg-field)',
                    boxShadow: 'inset 0 0 0 1px var(--hairline)',
                  }}
                >
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
          style={{ gap: 12, padding: '14px 18px 18px', borderTop: '1px solid var(--hairline)' }}
        >
          <div style={{ padding: 6, borderRadius: 12, background: '#ffffff', lineHeight: 0 }}>
            <ShareCardQr value={shareDeepLink} size={56} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-1)' }}>{t('shareCard.scanToJoin')}</p>
            <p
              className="truncate"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--fg-3)' }}
            >
              {shortLink}
            </p>
          </div>
        </div>
      )}
    </div>
  )
})
