'use client'

import { PillButton } from '@/components/ui/pill-button'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
import { Skeleton } from '@/components/ui/skeleton'
import { useTranslations } from 'next-intl'

const SECONDARY_ACTION_STYLE = {
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  fontWeight: 500,
  padding: '12px 16px',
  margin: '-4px 0',
  textDecoration: 'underline',
  textUnderlineOffset: 4,
  textDecorationThickness: 1,
  textDecorationColor: 'var(--hairline-strong)',
} as const

interface HabitListEmptyStateProps {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  askAstraLabel?: string
  onAskAstra?: () => void
  variant?: 'primary' | 'secondary'
}

/** InicioEmpty kit state — 104px satellite glyph, 22/500 title, 15 fg-2 body,
 *  then a stacked full-width Astra pill + ghost create pill. Description
 *  renders only when it's a distinct sentence from the title (avoids the
 *  legacy "title and description share the same key" double-render). */
export function HabitListEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  askAstraLabel,
  onAskAstra,
  variant = 'primary',
}: Readonly<HabitListEmptyStateProps>) {
  const isAstraPrompt = variant === 'primary'
  const hasDistinctDescription =
    Boolean(description) && description !== title
  const showAstraAction = isAstraPrompt && Boolean(askAstraLabel) && Boolean(onAskAstra)
  const showStackedActions = showAstraAction || (isAstraPrompt && Boolean(actionLabel))

  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{ padding: '64px 32px', gap: 16 }}
    >
      <SatelliteGlyph size={104} />
      <div
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 22,
          fontWeight: 500,
          color: 'var(--fg-1)',
          textWrap: 'balance',
        }}
      >
        {title}
      </div>
      {hasDistinctDescription && (
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            color: 'var(--fg-2)',
            maxWidth: 300,
            lineHeight: 1.5,
            textWrap: 'pretty',
          }}
        >
          {description}
        </div>
      )}
      {showStackedActions ? (
        <div
          className="flex w-full max-w-[300px] flex-col items-stretch"
          style={{ marginTop: 8, gap: 12 }}
        >
          {showAstraAction && askAstraLabel && (
            <PillButton

              onClick={onAskAstra}

            >
              {askAstraLabel}
            </PillButton>
          )}
          {actionLabel && (
            <PillButton
              variant="ghost"

              onClick={onAction}

            >
              {actionLabel}
            </PillButton>
          )}
        </div>
      ) : (
        actionLabel && (
          <button
            type="button"
            onClick={onAction}
            className="appearance-none border-0 bg-transparent cursor-pointer text-[var(--fg-1)] hover:text-[var(--primary)] transition-[color] duration-[var(--dur-fast)] ease-[var(--ease-standard)]"
            style={SECONDARY_ACTION_STYLE}
          >
            {actionLabel}
          </button>
        )
      )}
    </div>
  )
}

export function HabitListSkeleton() {
  const t = useTranslations()

  return (
    <div className="flex flex-col gap-3 px-4">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} variant="habit-row" label={t('common.loading')} />
      ))}
    </div>
  )
}

