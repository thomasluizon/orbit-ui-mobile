'use client'

import type { Ref } from 'react'
import { useTranslations } from 'next-intl'
import type { Recap } from '@orbit/shared/types/gamification'
import {
  buildShareCardStats,
  buildShareCardWeekday,
  recapPeriodLabelKey,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
} from '@orbit/shared/utils'
import { OrbitMark } from '@/components/ui/orbit-mark'

interface ShareCardProps {
  recap: Recap
  ref?: Ref<HTMLDivElement>
}

/** The 9 by 16 composed Wrapped image captured by html-to-image. */
export function ShareCard({ recap, ref }: Readonly<ShareCardProps>) {
  const t = useTranslations()
  const stats = buildShareCardStats(recap.metrics, recap.goalCompletions)
  const weekday = buildShareCardWeekday(recap.metrics.weeklyConsistency)

  return (
    <div
      ref={ref}
      data-testid="share-card"
      style={{
        width: SHARE_CARD_WIDTH,
        height: SHARE_CARD_HEIGHT,
        flex: '0 0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        overflow: 'hidden',
        padding: 32,
        borderRadius: 20,
        background: 'var(--bg-card)',
        boxShadow: 'inset 0 0 0 1px var(--hairline)',
        color: 'var(--fg-1)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div className="flex items-center" style={{ gap: 8 }}>
        <OrbitMark size={28} accent />
        <span
          translate="no"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: '-0.02em',
          }}
        >
          Orbit
        </span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            color: 'var(--fg-3)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
          }}
        >
          {t(recapPeriodLabelKey(recap.period))}
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 24,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span
            data-testid="share-card-figure"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 88,
              lineHeight: 0.92,
              fontWeight: 600,
              letterSpacing: '-0.04em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {stats[0]!.value}
          </span>
          <span style={{ color: 'var(--fg-2)', fontSize: 20 }}>{t(stats[0]!.labelKey)}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {stats.slice(1).map((stat) => (
            <div key={stat.labelKey} className="flex items-baseline" style={{ gap: 8 }}>
              <span
                data-testid="share-card-figure"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 34,
                  lineHeight: 1,
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {stat.value}
              </span>
              <span style={{ color: 'var(--fg-2)', fontSize: 16 }}>{t(stat.labelKey)}</span>
            </div>
          ))}
        </div>
      </div>

      <p
        data-testid="share-card-weekday"
        style={{ color: 'var(--fg-3)', fontSize: 16, lineHeight: 1.5, textWrap: 'pretty' }}
      >
        {t('shareCard.weeklyBarLabel', {
          day: t(weekday.labelKey),
          percent: weekday.percentage,
        })}
      </p>
    </div>
  )
}
