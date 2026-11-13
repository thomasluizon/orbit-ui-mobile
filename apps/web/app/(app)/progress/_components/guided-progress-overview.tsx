'use client'

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { animate } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'
import type { BarChartPoint } from '@orbit/shared/contracts/display'
import type { OrbitLookTarget } from '@orbit/shared/contracts/brand'
import { motionDurations } from '@orbit/shared/theme'
import {
  getBestRetrospectiveWeekdayKey,
  mapCompletionSeries,
  resolveProgressOrbitLine,
  resolveProgressWindowStatus,
  type ProgressWindowStatus,
} from '@orbit/shared/utils'
import { PROGRESS_SUBMENUS } from '@orbit/shared/utils/progress-navigation'
import type { RetrospectiveMetrics } from '@orbit/shared/utils/retrospective'
import { RootNotificationHeader } from '@/components/navigation/root-notification-header'
import { ShareCardEntryButton } from '@/components/share/share-card-entry-button'
import { ActionRow } from '@/components/ui/action-row'
import { BarChart } from '@/components/ui/bar-chart'
import { ErrorState } from '@/components/ui/error-state'
import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { ListRow } from '@/components/ui/list-row'
import { OrbitMascot, useStateMascotSize } from '@/components/ui/orbit-mascot'
import { PillLink } from '@/components/ui/pill-button'
import { SettingsGroup } from '@/components/ui/settings-group'
import { StatTile } from '@/components/ui/stat-tile'
import { useChangedProgressFigures } from '@/hooks/use-changed-progress-figures'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import { useOrbitLook } from '@/hooks/use-orbit-look'
import { useProgressRetrospective } from '@/hooks/use-retrospective'
import { useViewportMatch } from '@/hooks/use-viewport-match'
import { LockedCard } from './locked-card'
import { TopHabitRow, WindowFigureGrid, WindowFigureLoading, WindowFrame } from './progress-window'

const LINE_FADE = { duration: motionDurations.micro / 1000 }

/** A line that changes cross-fades in. The first line and every line under reduced motion appear still. */
function useLineFade(line: string | null, reducedMotion: boolean) {
  const lineRef = useRef<HTMLParagraphElement>(null)
  const shownLine = useRef(line)
  useEffect(() => {
    if (shownLine.current === line) return undefined
    shownLine.current = line
    if (reducedMotion || !lineRef.current) return undefined
    const fade = animate(lineRef.current, { opacity: [0, 1] }, LINE_FADE)
    return () => fade.stop()
  }, [line, reducedMotion])
  return lineRef
}

/** Orbit at 96 (128 at 1024 and above), centred, with the one Orbit line of the root under it. */
function ProgressOrbitGroup({ line, mascotRef, lookAt, action }: Readonly<{
  line: string | null
  mascotRef: RefObject<HTMLSpanElement | null>
  lookAt: OrbitLookTarget | null
  action?: ReactNode
}>) {
  const size = useStateMascotSize()
  const reducedMotion = useViewportMatch('(prefers-reduced-motion: reduce)')
  const lineRef = useLineFade(line, reducedMotion)
  return (
    <div data-progress-orbit="" className="flex flex-col items-center gap-3 text-center">
      <span ref={mascotRef} aria-hidden="true"><OrbitMascot size={size} state="parado" lookAt={lookAt} /></span>
      {line ? <p ref={lineRef} data-progress-orbit-line="" data-line-motion={reducedMotion ? 'still' : 'fade'}
        className="max-w-[592px] text-balance text-base leading-6 text-[var(--fg-2)]">{line}</p> : null}
      {action ? <div data-empty-state-action="">{action}</div> : null}
    </div>
  )
}

function GuidedWindowFigures({ metrics }: Readonly<{ metrics: RetrospectiveMetrics }>) {
  const t = useTranslations()
  const changed = useChangedProgressFigures(metrics)
  const bestWeekday = getBestRetrospectiveWeekdayKey(metrics.weeklyConsistency)
  return (
    <WindowFigureGrid>
      <StatTile value={`${Math.round(metrics.completionRate)}%`} label={t('progressScreen.window.completionRate')} roll={changed.has('completionRate')} />
      <StatTile value={metrics.activeDays} label={t('progressScreen.window.activeDays')} roll={changed.has('activeDays')} />
      {bestWeekday
        ? <StatTile value={t(`dates.daysAbbreviated.${bestWeekday}`)} label={t('progressScreen.window.bestWeekday')} roll={changed.has('bestWeekday')} />
        : <StatTile state="empty" emptyLabel={t('progressScreen.window.bestWeekdayEmpty')} label={t('progressScreen.window.bestWeekday')} />}
    </WindowFigureGrid>
  )
}

/** The 30-day window under the question heading. The empty window has no heading: Orbit states it. */
function GuidedWindowSection({ status, retrospective, chartRef, onSelectPoint }: Readonly<{
  status: ProgressWindowStatus
  retrospective: ReturnType<typeof useProgressRetrospective>
  chartRef: RefObject<HTMLDivElement | null>
  onSelectPoint: (point: BarChartPoint, bar: HTMLElement) => void
}>) {
  const t = useTranslations()
  const locale = useLocale()
  const title = t('progressScreen.sections.windowQuestion')
  if (status === 'empty') return null
  if (status === 'locked') return <WindowFrame title={title}><LockedCard title={t('progressScreen.window.lockedTitle')} body={t('progressScreen.window.lockedBody')} action={t('progressScreen.window.lockedAction')} /></WindowFrame>
  if (status === 'loading') return <WindowFrame title={title} statusText={t('progressScreen.loading')}><WindowFigureLoading label={t('progressScreen.loading')} /></WindowFrame>
  if (status === 'error') {
    return (
      <WindowFrame title={title}>
        <ErrorState message={t('progressScreen.error')} action={<IconButton label={t('progressScreen.retry')} onClick={() => void retrospective.refetch()}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>} />
      </WindowFrame>
    )
  }
  const metrics = retrospective.data!.metrics
  const points = metrics.completionSeries ? mapCompletionSeries(metrics.completionSeries, locale) : []
  return (
    <WindowFrame title={title}>
      {points.some((point) => point.scheduled > 0) ? <div ref={chartRef}><BarChart points={points} label={t('progressScreen.window.chartLabel')} onSelectPoint={onSelectPoint} /></div> : null}
      <GuidedWindowFigures metrics={metrics} />
      <TopHabitRow habit={metrics.topHabits[0]} />
      <ActionRow><ShareCardEntryButton variant="button" /></ActionRow>
    </WindowFrame>
  )
}

/** A press on a bar changes the line to that day and Orbit looks at the bar. The same bar again, or a press outside the chart, returns the default line. */
function useBarSelection(chartRef: RefObject<HTMLDivElement | null>) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const { mascotRef, lookAt, lookTowards, lookAway } = useOrbitLook()
  const select = (point: BarChartPoint, bar: HTMLElement) => {
    if (point.startDate === selectedDate) {
      setSelectedDate(null)
      lookAway()
      return
    }
    setSelectedDate(point.startDate)
    lookTowards(bar)
  }
  useEffect(() => {
    if (selectedDate === null) return undefined
    const clearOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && chartRef.current?.contains(event.target)) return
      setSelectedDate(null)
      lookAway()
    }
    document.addEventListener('pointerdown', clearOutside)
    return () => document.removeEventListener('pointerdown', clearOutside)
  }, [selectedDate, chartRef, lookAway])
  return { selectedDate, select, mascotRef, lookAt }
}

/** The Progresso root under `orbit_guided_flows`: Orbit answers "am I moving", then the person asks the next thing. */
export function GuidedProgressOverview() {
  const t = useTranslations()
  const locale = useLocale()
  const isDesktop = useIsDesktop()
  const rowsHeadingId = useId()
  const chartRef = useRef<HTMLDivElement>(null)
  const retrospective = useProgressRetrospective()
  const status = resolveProgressWindowStatus(retrospective)
  const { selectedDate, select, mascotRef, lookAt } = useBarSelection(chartRef)
  const line = resolveProgressOrbitLine(status, retrospective.data?.metrics, selectedDate, locale)
  const emptyAction = status === 'empty' ? <PillLink href="/" variant={isDesktop ? 'secondary' : 'primary'} size="sm">{t('progressScreen.window.emptyAction')}</PillLink> : undefined
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[740px] flex-col" data-progress-screen="overview" data-progress-guided="">
      <RootNotificationHeader />
      <div className="flex min-w-0 flex-col gap-section-stack-gap px-screen-gutter py-4">
        <h1 className="sr-only" tabIndex={-1}>{t('progressScreen.title')}</h1>
        <ProgressOrbitGroup line={line ? t(line.key, line.values) : null} mascotRef={mascotRef} lookAt={lookAt} action={emptyAction} />
        <GuidedWindowSection status={status} retrospective={retrospective} chartRef={chartRef} onSelectPoint={select} />
        <section aria-labelledby={rowsHeadingId} className="flex flex-col gap-section-title-gap">
          <h2 id={rowsHeadingId} className="text-[20px] font-medium text-[var(--fg-1)]">{t('progressScreen.sectionsQuestion')}</h2>
          <SettingsGroup>
            {PROGRESS_SUBMENUS.map((entry) => <ListRow key={entry.id} placement="column" textMode="label" icon={entry.icon} title={t(entry.labelKey)} description={entry.descriptionKey ? t(entry.descriptionKey) : undefined} href={entry.route} />)}
          </SettingsGroup>
        </section>
      </div>
    </div>
  )
}
