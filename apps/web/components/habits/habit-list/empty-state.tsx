'use client'

import { PillButton } from '@/components/ui/pill-button'
import { OrbitMark } from '@/components/ui/orbit-mark'
import { Skeleton } from '@/components/ui/skeleton'
import { useTranslations } from 'next-intl'
import { OfflineRefusal } from '@/components/ui/offline-refusal'

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
  createRefusal?: boolean
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
  createRefusal,
  askAstraLabel,
  onAskAstra,
  variant = 'primary',
}: Readonly<HabitListEmptyStateProps>) {
  const t = useTranslations()
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
      <OrbitMark size={104} />
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
            className="appearance-none border-0 bg-transparent cursor-pointer text-[var(--fg-1)] hover:text-[var(--primary-soft)] transition-[color] duration-[var(--dur-fast)] ease-[var(--ease-standard)]"
            style={SECONDARY_ACTION_STYLE}
          >
            {actionLabel}
          </button>
        )
      )}
      <div aria-live="polite" aria-atomic="true" className="w-full max-w-[300px]">
        {createRefusal ? <OfflineRefusal icon="create" title={t('offline.create.title')} reason={t('offline.create.reason')} /> : null}
      </div>
    </div>
  )
}

export function HabitListAllDone({ onSeeUpcoming }: Readonly<{ onSeeUpcoming?: () => void }>) {
  const t = useTranslations()
  return (
    <div className="flex flex-col items-start" style={{ gap: 8, paddingBlock: 8 }}>
      <p style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--fg-1)' }}>
        {t('habits.allDoneToday')}
      </p>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--fg-2)', textWrap: 'pretty' }}>
        {t('habits.allDoneHint')}
      </p>
      {onSeeUpcoming ? (
        <PillButton variant="ghost" size="sm" onClick={onSeeUpcoming}>
          {t('habits.seeUpcoming')}
        </PillButton>
      ) : null}
    </div>
  )
}

export function HabitListNothingOpen() {
  const t = useTranslations()
  return <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--fg-3)', textWrap: 'pretty' }}>{t('habits.nothingOpen')}</p>
}

export function HabitListSkeleton() {
  const t = useTranslations()

  return (
    <div className="flex flex-col gap-3 px-4 pb-24" aria-busy="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} variant="habit-row" label={t('common.loading')} />
      ))}
    </div>
  )
}
