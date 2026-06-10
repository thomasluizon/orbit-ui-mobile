'use client'

import { getHabitEmptyStateKey } from '@orbit/shared/utils'
import { PillButton } from '@/components/ui/pill-button'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'

interface HabitListEmptyStateProps {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  variant?: 'primary' | 'secondary'
}

/** Kit empty state — satellite glyph, title, optional Astra pill or quiet link.
 *  Description renders only when it's a distinct sentence from the title
 *  (avoids the legacy "title and description share the same key" double-render). */
export function HabitListEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  variant = 'primary',
}: Readonly<HabitListEmptyStateProps>) {
  const isAstraPrompt = variant === 'primary'
  const hasDistinctDescription =
    Boolean(description) && description !== title

  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{ padding: '60px 24px' }}
    >
      <SatelliteGlyph />
      <div
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 20,
          fontWeight: 500,
          color: 'var(--fg-1)',
          marginTop: 18,
        }}
      >
        {title}
      </div>
      {hasDistinctDescription && (
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            color: 'var(--fg-3)',
            maxWidth: 280,
            lineHeight: 1.5,
            marginTop: 6,
          }}
        >
          {description}
        </div>
      )}
      {actionLabel && (
        isAstraPrompt ? (
          <PillButton onClick={onAction} className="mt-[22px]">
            {actionLabel}
          </PillButton>
        ) : (
          <button
            type="button"
            onClick={onAction}
            className="mt-[22px] appearance-none border-0 bg-transparent cursor-pointer"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--fg-1)',
              padding: 0,
              textDecoration: 'underline',
              textUnderlineOffset: 4,
              textDecorationThickness: 1,
              textDecorationColor: 'var(--hairline-strong)',
            }}
          >
            {actionLabel}
          </button>
        )
      )}
    </div>
  )
}

export function HabitListSkeleton() {
  return (
    <div>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center"
          style={{
            padding: '16px 20px',
            gap: 14,
            borderBottom: '1px solid var(--hairline)',
          }}
        >
          <div className="flex-1 flex flex-col" style={{ gap: 8 }}>
            <div
              className="rounded-sm animate-pulse"
              style={{ width: '55%', height: 10, background: 'var(--bg-sunk)' }}
            />
            <div
              className="rounded-sm animate-pulse"
              style={{ width: '30%', height: 7, background: 'var(--bg-sunk)' }}
            />
          </div>
          <div
            className="rounded-full shrink-0"
            style={{
              width: 9,
              height: 9,
              boxShadow: 'inset 0 0 0 1.5px var(--hairline-strong)',
            }}
          />
        </div>
      ))}
    </div>
  )
}

export function getEmptyHabitsMessage(
  view: 'today' | 'all' | 'general',
  t: (key: string) => string,
): string {
  return t(getHabitEmptyStateKey(view))
}
