'use client'

import type { HabitCardTranslationAdapter } from '@orbit/shared/utils'
import { SectionLabel } from '@/components/ui/section-label'

export type TranslationFn = HabitCardTranslationAdapter

export interface HabitDetailMetrics {
  currentStreak: number
  longestStreak: number
  monthlyCompletionRate: number
}

interface HabitDetailStatsGridProps {
  metrics: HabitDetailMetrics | null
  loading: boolean
  t: TranslationFn
}

/** Hairline triple stat row: mono numerals (24px) under a sans label.
 *  Mirrors v8 StatTriple from .tmp/render/orbit-screens-detail-create.jsx. */
export function HabitDetailStatsGrid({
  metrics,
  loading,
  t,
}: Readonly<HabitDetailStatsGridProps>) {
  if (metrics) {
    return (
      <div>
        <SectionLabel>{t('habits.detail.stats')}</SectionLabel>
        <StatTriple
          items={[
            [t('habits.detail.currentStreak'), String(metrics.currentStreak)],
            [t('habits.detail.longestStreak'), String(metrics.longestStreak)],
            [t('habits.detail.monthlyRate'), `${Math.round(metrics.monthlyCompletionRate)}%`],
          ]}
        />
      </div>
    )
  }

  if (!metrics && loading) {
    return (
      <div>
        <SectionLabel>{t('habits.detail.stats')}</SectionLabel>
        <div
          className="grid grid-cols-3"
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--hairline)',
          }}
        >
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col" style={{ gap: 6 }}>
              <div
                className="rounded animate-pulse"
                style={{ height: 10, width: 48, background: 'var(--bg-elev)' }}
              />
              <div
                className="rounded animate-pulse"
                style={{ height: 20, width: 40, background: 'var(--bg-elev)' }}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // metrics is null and not loading
  return (
    <div>
      <SectionLabel>{t('habits.detail.stats')}</SectionLabel>
      <p
        className="text-center"
        style={{
          padding: '14px 20px',
          fontFamily: 'var(--font-family-sans)',
          fontSize: 13,
          fontStyle: 'italic',
          color: 'var(--fg-3)',
        }}
      >
        {t('habits.detail.noDataYet')}
      </p>
    </div>
  )
}

interface StatTripleProps {
  items: ReadonlyArray<readonly [string, string]>
}

/** 3-column flush stat row: label (11px sans) above value (24px mono). */
export function StatTriple({ items }: Readonly<StatTripleProps>) {
  return (
    <div
      className="grid grid-cols-3"
      style={{
        padding: '14px 20px',
        borderBottom: '1px solid var(--hairline)',
      }}
    >
      {items.map(([label, val]) => (
        <div key={label} className="flex flex-col" style={{ gap: 4 }}>
          <span
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--fg-3)',
            }}
          >
            {label}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-family-mono)',
              fontSize: 24,
              fontWeight: 500,
              color: 'var(--fg-1)',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.02em',
              lineHeight: 1,
            }}
          >
            {val}
          </span>
        </div>
      ))}
    </div>
  )
}

interface Last28GridProps {
  done: boolean[]
}

/** Last-28-day grid: 14 cells wide, primary-filled when done, hairline ring when empty. */
export function Last28Grid({ done }: Readonly<Last28GridProps>) {
  return (
    <div style={{ padding: '12px 20px 4px' }}>
      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(14, 1fr)', gap: 4 }}
      >
        {done.map((d, i) => (
          <div
            key={i}
            style={{
              aspectRatio: '1 / 1',
              background: d ? 'var(--primary)' : 'transparent',
              boxShadow: d ? 'none' : 'inset 0 0 0 1px var(--hairline-strong)',
              borderRadius: 3,
            }}
          />
        ))}
      </div>
    </div>
  )
}
