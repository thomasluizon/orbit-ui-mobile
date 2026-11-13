'use client'

import { useId, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import {
  extractBackendErrorCode,
  getBestRetrospectiveWeekdayKey,
  isPayGateError,
  mapCompletionSeries,
} from '@orbit/shared/utils'
import { ShareCardEntryButton } from '@/components/share/share-card-entry-button'
import { ActionRow } from '@/components/ui/action-row'
import { BarChart } from '@/components/ui/bar-chart'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { IconButton } from '@/components/ui/icon-button'
import { ChevronDown, ChevronRight, RefreshCw } from '@/components/ui/icons'
import { PersonalText } from '@/components/ui/personal-text'
import { PersonalTextAction } from '@/components/ui/personal-text-action'
import { PillLink } from '@/components/ui/pill-button'
import { Skeleton } from '@/components/ui/skeleton'
import { StatTile } from '@/components/ui/stat-tile'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import { useProgressRetrospective } from '@/hooks/use-retrospective'
import { LockedCard } from './locked-card'

const NO_HABITS_FOR_PERIOD = 'NO_HABITS_FOR_PERIOD'

export function WindowFigureGrid({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="flex flex-wrap gap-4">{children}</div>
}

/** One busy region covers the figures and the habit row. */
export function WindowFigureLoading({ label }: Readonly<{ label: string }>) {
  const t = useTranslations()
  return (
    <div role="progressbar" aria-busy="true" aria-label={label} className="flex flex-col gap-3">
      <Skeleton variant="bar-chart" grouped />
      <WindowFigureGrid>
        {(['completionRate', 'activeDays', 'bestWeekday'] as const).map((key) => <div key={key} aria-hidden="true" className="flex flex-1" style={{ minWidth: 'max-content' }}><StatTile state="loading" loadingLabel={label} label={t(`progressScreen.window.${key}`)} /></div>)}
      </WindowFigureGrid>
      <Skeleton variant="habit-row" grouped />
    </div>
  )
}

export function WindowFrame({ children, title, statusText = '' }: Readonly<{ children: ReactNode; title: string; statusText?: string }>) {
  const headingId = useId()
  return (
    <section className="flex flex-col gap-section-title-gap" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-[20px] font-medium text-[var(--fg-1)]">{title}</h2>
      <p role="status" aria-live="polite" className="sr-only">{statusText}</p>
      {children}
    </section>
  )
}

export function TopHabitRow({ habit }: Readonly<{ habit?: { name: string; emoji: string | null; habitId?: string | null } }>) {
  const t = useTranslations()
  const [expanded, setExpanded] = useState(false)
  const titleId = useId()
  const ChevronIcon = habit?.habitId ? ChevronRight : ChevronDown
  const content = <>
    <span className="flex items-center justify-between gap-3">
      <span className="whitespace-nowrap text-[14px] leading-5 text-[var(--fg-2)]">{t('progressScreen.window.topHabit')}</span>
      {habit ? <ChevronIcon size={24} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-[var(--fg-3)]" /> : null}
    </span>
    {habit ? <span title={habit.name} className="flex min-w-0 items-start gap-1 text-[17px] leading-[1.4] text-[var(--fg-1)]">
      {habit.emoji ? <span aria-hidden="true">{habit.emoji}</span> : null}<PersonalText id={titleId} expanded={expanded}>{habit.name}</PersonalText>
    </span> : <span className="text-[14px] text-[var(--fg-3)]">{t('progressScreen.window.topHabitEmpty')}</span>}
  </>
  const rowClass = 'flex min-h-[68px] min-w-0 flex-col gap-1 rounded-[12px] p-4'
  const control = habit?.habitId
    ? <Link href={`/habits/${habit.habitId}`} data-testid="progress-top-habit" className={`${rowClass} touch-manipulation transition-[background-color] duration-[var(--dur-hover)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--fg-1)]`}>{content}</Link>
    : habit ? <button type="button" aria-label={`${t('progressScreen.window.topHabit')}, ${habit.name}`} aria-expanded={expanded} aria-controls={titleId} onClick={() => setExpanded(!expanded)} data-testid="progress-top-habit" className={`${rowClass} w-full text-start touch-manipulation transition-[background-color] duration-[var(--dur-hover)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--fg-1)]`}>{content}</button> : <div data-testid="progress-top-habit" className={rowClass}>{content}</div>
  return habit && !habit.habitId ? <PersonalTextAction label={`${t('progressScreen.window.topHabit')}, ${habit.name}`} contentClassName={rowClass} control={control} /> : control
}

export function WindowSection() {
  const t = useTranslations()
  const locale = useLocale()
  const isDesktop = useIsDesktop()
  const retrospective = useProgressRetrospective()
  if (isPayGateError(retrospective.error)) return <WindowFrame title={t('progressScreen.sections.window')}><LockedCard title={t('progressScreen.window.lockedTitle')} body={t('progressScreen.window.lockedBody')} action={t('progressScreen.window.lockedAction')} /></WindowFrame>
  if (retrospective.isLoading) return <WindowFrame title={t('progressScreen.sections.window')} statusText={t('progressScreen.loading')}><WindowFigureLoading label={t('progressScreen.loading')} /></WindowFrame>
  const hasNoHabits = retrospective.isError && extractBackendErrorCode(retrospective.error) === NO_HABITS_FOR_PERIOD
  if (hasNoHabits) return <WindowFrame title={t('progressScreen.sections.window')} statusText={t('progressScreen.window.empty')}><EmptyState title={t('progressScreen.window.empty')} action={<PillLink href="/" variant={isDesktop ? 'secondary' : 'primary'} size="sm">{t('progressScreen.window.emptyAction')}</PillLink>} /></WindowFrame>
  if (retrospective.isError) {
    return (
      <WindowFrame title={t('progressScreen.sections.window')}>
        <ErrorState
          message={t('progressScreen.error')}
          action={<IconButton label={t('progressScreen.retry')} onClick={() => void retrospective.refetch()}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>}
        />
      </WindowFrame>
    )
  }
  if (!retrospective.data) return <WindowFrame title={t('progressScreen.sections.window')}><WindowFigureLoading label={t('progressScreen.loading')} /></WindowFrame>
  const metrics = retrospective.data.metrics
  const bestWeekday = getBestRetrospectiveWeekdayKey(metrics.weeklyConsistency)
  const topHabit = metrics.topHabits[0]
  const points = metrics.completionSeries ? mapCompletionSeries(metrics.completionSeries, locale) : []
  return (
    <WindowFrame title={t('progressScreen.sections.window')}>
      {points.some((point) => point.scheduled > 0) ? <BarChart points={points} label={t('progressScreen.window.chartLabel')} /> : null}
      <WindowFigureGrid>
        <StatTile value={`${Math.round(metrics.completionRate)}%`} label={t('progressScreen.window.completionRate')} />
        <StatTile value={metrics.activeDays} label={t('progressScreen.window.activeDays')} />
        {bestWeekday ? <StatTile value={t(`dates.daysAbbreviated.${bestWeekday}`)} label={t('progressScreen.window.bestWeekday')} /> : <StatTile state="empty" emptyLabel={t('progressScreen.window.bestWeekdayEmpty')} label={t('progressScreen.window.bestWeekday')} />}
      </WindowFigureGrid>
      <TopHabitRow habit={topHabit} />
      <ActionRow><ShareCardEntryButton variant="button" /></ActionRow>
    </WindowFrame>
  )
}
