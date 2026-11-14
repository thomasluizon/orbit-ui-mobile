'use client'

import { StreakFigure } from '@/components/gamification/streak-figure'

import { IconButton } from '@/components/ui/icon-button'

import { ShareCardEntryButton } from '@/components/share/share-card-entry-button'

import { ActionRow } from '@/components/ui/action-row'

import { PersonalText } from '@/components/ui/personal-text'
import { PersonalTextAction } from '@/components/ui/personal-text-action'

import Link from 'next/link'
import { PROGRESS_SUBMENUS, type ProgressSubmenuId } from '@orbit/shared/utils/progress-navigation'
import { ListRow } from '@/components/ui/list-row'
import { SettingsGroup } from '@/components/ui/settings-group'
import { ProgressSubscreen } from './progress-subscreen'
import { ProgressLoading } from './progress-loading'
import { ProgressGoalsContent } from './goals/progress-goals-content'
import { RootNotificationHeader } from '@/components/navigation/root-notification-header'

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEventHandler,
  type ReactNode,
} from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  buildProtectedDayLabels,
  buildStreakWeekDays,
  deriveStreakRepairState,
  extractBackendErrorCode,
  extractBackendStatus,
  formatStreakDate,
  formatStreakRepairDates,
  getBestRetrospectiveWeekdayKey,
  getStreakRepairErrorMessageKey,
  getStreakTierLabelKey,
  isPayGateError,
  visibleProgressAchievements,
  mapCompletionSeries,
  type StreakRepairState,
} from '@orbit/shared/utils'
import { BarChart } from '@/components/ui/bar-chart'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { DayStrip } from '@/components/dates/day-strip'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { FreezeBank } from '@/components/ui/freeze-bank'
import { ChevronDown, ChevronRight, Lock, Snowflake, RefreshCw } from '@/components/ui/icons'
import { AchievementTile } from '@/components/gamification/achievement-tile'
import { LevelSummary } from '@/components/gamification/level-summary'
import { PillButton, PillLink } from '@/components/ui/pill-button'
import { ProBadge } from '@/components/ui/pro-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { StatTile } from '@/components/ui/stat-tile'
import { useGamificationProfile, useRepairStreak, useStreakFreeze } from '@/hooks/use-gamification'

import { useIsDesktop } from '@/hooks/use-is-desktop'
import { useProfile } from '@/hooks/use-profile'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useProgressRetrospective } from '@/hooks/use-retrospective'

const NO_HABITS_FOR_PERIOD = 'NO_HABITS_FOR_PERIOD'

function Section({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return <section className="flex flex-col gap-4" aria-label={title}>{children}</section>
}

function WindowFigureGrid({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="flex flex-wrap gap-4">{children}</div>
}

/** One busy region covers the figures and the habit row. */
function WindowFigureLoading({ label }: Readonly<{ label: string }>) {
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

function WindowFrame({ children, title, statusText = '' }: Readonly<{ children: ReactNode; title: string; statusText?: string }>) {
  const headingId = useId()
  return (
    <section className="flex flex-col gap-section-title-gap" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-[20px] font-medium text-[var(--fg-1)]">{title}</h2>
      <p role="status" aria-live="polite" className="sr-only">{statusText}</p>
      {children}
    </section>
  )
}

function LockedCard({ title, body, action }: Readonly<{ title: string; body: string; action: string }>) {
  return (
    <div data-testid="progress-locked-card" className="flex flex-col items-start gap-3 rounded-[20px] bg-[var(--bg-card)] p-record-inset shadow-[inset_0_0_0_1px_var(--hairline-ghost)]">
      <div className="flex items-center gap-3">
        <Lock size={20} strokeWidth={2} aria-hidden="true" className="text-[var(--fg-2)]" />
        <ProBadge alwaysVisible />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[16px] font-medium text-[var(--fg-1)]">{title}</p>
        <p className="text-[14px] text-[var(--fg-3)]">{body}</p>
      </div>
      <PillLink href="/upgrade" variant="ghost" size="sm">{action}</PillLink>
    </div>
  )
}

function FrozenTodayStatus({ isFrozenToday }: Readonly<{ isFrozenToday: boolean }>) {
  const t = useTranslations()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => { if (active) setMounted(true) })
    return () => { active = false }
  }, [])
  const showMessage = mounted && isFrozenToday
  return (
    <div data-testid="streak-frozen-status" role="status" className={showMessage ? 'flex items-center gap-3 rounded-[12px] bg-[var(--bg-well)] p-3 text-[14px] text-[var(--fg-2)]' : 'sr-only'}>
      {showMessage ? <><Snowflake size={20} strokeWidth={2} color="var(--status-frozen)" aria-hidden="true" /><p>{t('progressScreen.streak.frozenToday')}</p></> : null}
    </div>
  )
}

function FreezeCoveredStatus({ date, remaining, origin, locale }: Readonly<{
  date: string
  remaining: number
  origin?: string | null
  locale: string
}>) {
  const t = useTranslations()
  return (
    <div role="status" className="flex items-center gap-3 rounded-[12px] bg-[var(--bg-well)] p-3 text-[14px] text-[var(--fg-2)]">
      <Snowflake size={20} strokeWidth={2} color="var(--status-frozen)" aria-hidden="true" />
      <p>{t(origin === 'automatic' ? 'progressScreen.streak.automaticCovered' : 'progressScreen.streak.covered', {
        date: formatStreakDate(date, locale),
        count: remaining,
      })}</p>
    </div>
  )
}

function RepairUnavailableCopy({ state }: Readonly<{
  state: StreakRepairState
}>) {
  const t = useTranslations()
  const message = state.banked === 0
    ? t('progressScreen.streak.repairEmpty')
    : state.bankFull
      ? t('progressScreen.streak.repairCapped', { needed: state.count, banked: state.banked })
      : t('progressScreen.streak.repairPartial', { needed: state.count, banked: state.banked })
  return <p className="text-[14px] leading-5 text-[var(--fg-2)]">{message}</p>
}

function StreakRepairPanel({
  state,
  ceiling,
  repair,
  isDesktop,
}: Readonly<{
  state: StreakRepairState
  ceiling: number
  repair: ReturnType<typeof useRepairStreak>
  isDesktop: boolean
}>) {
  const t = useTranslations()
  const locale = useLocale()
  const [confirmOpen, setConfirmOpen] = useAccountScopedState(false)
  const repairStatus = extractBackendStatus(repair.error)
  if (state.gapUnavailable) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-[12px] bg-[var(--bg-well)] p-4">
        <p className="text-[16px] leading-[1.5] text-[var(--fg-1)]">{t('progressScreen.streak.gapUnavailable')}</p>
      </div>
    )
  }
  if (state.showGap) {
    const datesLabel = formatStreakRepairDates(state.dates, locale)
    return (
      <>
        <div className="flex flex-col items-start gap-3 rounded-[12px] bg-[var(--bg-well)] p-4">
          <p className="text-[16px] leading-[1.5] text-[var(--fg-1)]">{t('progressScreen.streak.gapBody', { count: state.count })}</p>
          {state.canRepair ? <PillButton variant={isDesktop ? 'secondary' : 'primary'} size="sm" loading={repair.isPending} onClick={() => setConfirmOpen(true)}>{t('progressScreen.streak.repairAction', { dates: datesLabel })}</PillButton> : null}
          {!state.canRepair ? <RepairUnavailableCopy state={state} /> : null}
          {repair.isError && repairStatus !== 409 ? <p role="alert" className="text-[14px] text-[var(--status-bad-text)]">{t(getStreakRepairErrorMessageKey(repairStatus))}</p> : null}
        </div>
        <ConfirmSheet
          open={confirmOpen}
          title={t('progressScreen.streak.repairConfirmTitle', { dates: datesLabel })}
          message={t('progressScreen.streak.repairConfirmBody', { count: state.count })}
          confirmLabel={t('progressScreen.streak.repairConfirmAction')}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false)
            repair.mutate(state.dates)
          }}
        />
      </>
    )
  }
  return state.bankFull
    ? <CapacityNotice message={t('progressScreen.streak.bankFull', { count: ceiling })} />
    : null
}

function StreakFreezeDetails({ freeze, repair, timeZone, longestStreak, currentStreak }: Readonly<{
  freeze: ReturnType<typeof useStreakFreeze>
  repair: ReturnType<typeof useRepairStreak>
  timeZone: string | null
  longestStreak: number
  currentStreak: number
}>) {
  const t = useTranslations()
  const locale = useLocale()
  const isDesktop = useIsDesktop()
  const tier = t(getStreakTierLabelKey(currentStreak))
  const repairState = deriveStreakRepairState({
    streak: freeze.streakInfo,
    freezesAvailable: freeze.freezesAvailable,
    banked: freeze.streakFreezesAccumulated,
    ceiling: freeze.maxStreakFreezesAccumulated,
    now: new Date(),
    accountTimeZone: timeZone,
  })
  const dayWords = {
    active: t('progressScreen.streak.active'),
    frozen: t('progressScreen.streak.frozen'),
    missed: t('progressScreen.streak.missed'),
    today: t('progressScreen.streak.today'),
  }
  return (
    <>
      <FrozenTodayStatus isFrozenToday={freeze.isFrozenToday} />
      {freeze.streakInfo?.lastFreezeCoveredDate && freeze.streakInfo.freezeBankRemaining != null ? (
        <FreezeCoveredStatus
          date={freeze.streakInfo.lastFreezeCoveredDate}
          remaining={freeze.streakInfo.freezeBankRemaining}
          origin={freeze.streakInfo.lastFreezeCoveredOrigin}
          locale={locale}
        />
      ) : null}
      <FreezeBank
        inSheet
        loadingLabel={!freeze.streakInfo ? t('progressScreen.loading') : undefined}
        banked={freeze.streakFreezesAccumulated}
        ceiling={freeze.maxStreakFreezesAccumulated}
        usedThisMonth={freeze.freezesUsedThisMonth}
        longestValue={longestStreak} longestLabel={t('progressScreen.streak.longest')}
        daysTowardNext={Math.max(0, 7 - freeze.daysUntilNextFreeze)}
        earnRateDays={7}
        tierValue={tier}
        tierLabel={t('streakDisplay.detail.tierTileLabel')}
        protectedDays={buildProtectedDayLabels(freeze.streakInfo?.recentFreezeDates ?? [], locale, freeze.isFrozenToday, timeZone ?? undefined)}
        words={{
          ...dayWords,
          legendLabel: t('progressScreen.streak.legend'),
          bankedLabel: t('progressScreen.streak.banked'), usedLabel: t('progressScreen.streak.used'), nextLabel: t('progressScreen.streak.next'), nextProgressLabel: t('progressScreen.streak.nextProgress'),
          nextFreezeProgress: t('progressScreen.streak.nextOf', { current: Math.max(0, 7 - freeze.daysUntilNextFreeze), total: 7 }),
          protectedLabel: t('progressScreen.streak.protectedDays'), protectedEmpty: t('progressScreen.streak.protectedEmpty'), protectedDay: t('progressScreen.streak.protected'), protectedToday: t('progressScreen.streak.protectedToday'),
        }}
      />
      {freeze.streakInfo ? <StreakRepairPanel state={repairState} ceiling={freeze.maxStreakFreezesAccumulated} repair={repair} isDesktop={isDesktop} /> : null}
    </>
  )
}

function StreakFreezeEntry({ loading, banked, ceiling, detailsOpen, controls, onClick }: Readonly<{
  loading: boolean
  banked: number
  ceiling: number
  detailsOpen: boolean
  controls?: string
  onClick: MouseEventHandler<HTMLElement>
}>) {
  const t = useTranslations()
  const label = t('progressScreen.streak.freezes')
  const value = `${banked} / ${ceiling}`
  return (
    <ListRow placement="column" textMode="label" title={label} accessibilityLabel={loading ? label : t('progressScreen.streak.freezesCount', { banked, ceiling })} expanded={detailsOpen} controls={controls} disabled={loading} valueHidden={loading} value={value} chevron onClick={onClick} />
  )
}

function StreakSection({ accountProfile, canView, gamificationProfile }: Readonly<{
  accountProfile: ReturnType<typeof useProfile>['profile']
  canView: boolean
  gamificationProfile: ReturnType<typeof useGamificationProfile>['profile']
}>) {
  const headingId = useId()
  const t = useTranslations()
  const locale = useLocale()
  const isDesktop = useIsDesktop()
  const [detailsOpen, setDetailsOpen] = useAccountScopedState(false)
  const { sheetRef } = useSheetHost()
  const entryRef = useRef<HTMLElement>(null)
  const detailsId = useId()
  const timeZone = accountProfile?.timeZone ?? null
  const freeze = useStreakFreeze(accountProfile, timeZone, canView)
  const repair = useRepairStreak(timeZone)
  const currentStreak = freeze.streakInfo?.currentStreak ?? gamificationProfile?.currentStreak ?? accountProfile?.currentStreak ?? 0
  const longestStreak = freeze.streakInfo?.longestStreak ?? gamificationProfile?.longestStreak ?? accountProfile?.longestStreak ?? 0
  const days = buildStreakWeekDays(freeze.streakInfo, currentStreak, freeze.isFrozenToday, new Date(), 14, timeZone ?? undefined, freeze.streakInfo?.firstEligibleDate)
  const labels = useMemo(() => days.map((day) => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(day.date)), [days, locale])
  const tier = t(getStreakTierLabelKey(currentStreak))
  const dayWords = {
    notScheduled: t('calendar.dayCell.notScheduled'),
    active: t('progressScreen.streak.active'),
    frozen: t('progressScreen.streak.frozen'),
    missed: t('progressScreen.streak.missed'),
    today: t('progressScreen.streak.today'),
  }

  if (canView && freeze.streakQuery.isError) {
    return (
      <section aria-labelledby={headingId} className="flex w-full flex-col gap-4"><h2 id={headingId} className="sr-only">{t('progressScreen.sections.streak')}</h2>
        <ErrorState
          message={t('progressScreen.error')}
          action={<IconButton label={t('progressScreen.retry')} onClick={() => void freeze.streakQuery.refetch()}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>}
        />
      </section>
    )
  }

  const loading = canView && !freeze.streakInfo

  return (
    <section aria-labelledby={headingId} aria-busy={loading} data-progress-streak-summary="" className="flex w-full flex-col gap-4"><h2 id={headingId} className="sr-only">{t('progressScreen.sections.streak')}</h2>
      <StreakFigure currentStreak={currentStreak} />
      <div role="group" aria-busy={loading} aria-label={loading ? t('progressScreen.loading') : undefined} className="relative min-w-0 w-full py-1">
        <div inert={loading || undefined} aria-hidden={loading || undefined} className={loading ? 'invisible' : undefined}>
          <DayStrip size={isDesktop ? 24 : 20} scope="account" days={days.map((day) => day.status)} labels={labels} label={t('progressScreen.streak.stripWindow', { count: days.length })} words={dayWords} />
        </div>
        {loading ? <div className="pointer-events-none absolute inset-0"><Skeleton variant="fill" grouped /></div> : null}
      </div>
      {canView ? <>
        <StreakFreezeEntry loading={loading} banked={freeze.streakFreezesAccumulated} ceiling={freeze.maxStreakFreezesAccumulated} detailsOpen={detailsOpen} controls={detailsOpen ? detailsId : undefined} onClick={(event) => { entryRef.current = event.currentTarget; setDetailsOpen(true) }} />
        {detailsOpen ? <Sheet ref={sheetRef} finalFocus={entryRef} open title={t('progressScreen.streak.freezes')} onClose={() => setDetailsOpen(false)}>
          <div id={detailsId} className="flex flex-col gap-4">
            <StreakFreezeDetails freeze={freeze} repair={repair} timeZone={timeZone} longestStreak={longestStreak} currentStreak={currentStreak} />
          </div>
        </Sheet> : null}
      </> : <><div className="flex flex-wrap gap-4"><StatTile value={longestStreak} label={t('progressScreen.streak.longest')} /><StatTile value={tier} label={t('streakDisplay.detail.tierTileLabel')} /></div><LockedCard title={t('progressScreen.streak.lockedTitle')} body={t('progressScreen.streak.lockedBody')} action={t('progressScreen.streak.lockedAction')} /></>}
    </section>
  )
}

function TopHabitRow({ habit }: Readonly<{ habit?: { name: string; emoji: string | null; habitId?: string | null } }>) {
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

function WindowSection() {
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

function AchievementsSection({ gamificationAvailable, profile, xpProgress }: Readonly<{
  gamificationAvailable: boolean
  profile: ReturnType<typeof useGamificationProfile>['profile']
  xpProgress: number
}>) {
  const t = useTranslations()
  if (!gamificationAvailable) {
    return (
      <Section title={t('progressScreen.sections.achievements')}>
        <div className="w-full">
          <LockedCard
            title={t('progressScreen.achievements.lockedTitle')}
            body={t('progressScreen.achievements.lockedBody')}
            action={t('progressScreen.achievements.lockedAction')}
          />
        </div>
      </Section>
    )
  }
  if (!profile) return null
  const achievements = visibleProgressAchievements(profile.achievements)
  const categories = Array.from(new Set(achievements.map((achievement) => achievement.category)))
  return (
    <>
      <LevelSummary profile={profile} xpProgress={xpProgress} />
      <Section title={t('progressScreen.sections.achievements')}>
        {achievements.length === 0 ? <EmptyState title={t('progressScreen.achievements.empty')} action={<PillLink href="/" variant="primary" size="sm">{t('progressScreen.achievements.emptyAction')}</PillLink>} /> : categories.map((category) => <div key={category} className="flex flex-col gap-section-title-gap"><h2 className="pt-1 text-[14px] font-medium leading-5 text-[var(--fg-2)]">{t(`gamification.categories.${category}`)}</h2><div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-3 lg:gap-4">{achievements.filter((achievement) => achievement.category === category).map((achievement) => <AchievementTile key={achievement.id} achievement={achievement} />)}</div></div>)}
      </Section>
    </>
  )
}

function ProgressOverview() {
  const t = useTranslations()
  return <div className="mx-auto flex w-full min-w-0 max-w-[740px] flex-col" data-progress-screen="overview">
    <RootNotificationHeader />
    <div className="flex min-w-0 flex-col gap-section-stack-gap px-screen-gutter py-4">
      <h1 className="sr-only" tabIndex={-1}>{t('progressScreen.title')}</h1>
      <WindowSection />
      <SettingsGroup>
        {PROGRESS_SUBMENUS.map((entry) => <ListRow key={entry.id} placement="column" textMode="label" icon={entry.icon} title={t(entry.labelKey)} description={entry.descriptionKey ? t(entry.descriptionKey) : undefined} href={entry.route} />)}
      </SettingsGroup>
    </div>
  </div>
}

function ProgressGamificationContent({ screen }: Readonly<{ screen: 'streak' | 'achievements' }>) {
  const t = useTranslations()
  const account = useProfile()
  const canView = account.profile?.canViewGamification ?? false
  const gamification = useGamificationProfile(canView)
  const available = canView && !isPayGateError(gamification.error)
  const error = account.isError || (available && gamification.isError)
  const loading = !error && (account.isLoading || (available && gamification.isLoading))
  const retry = () => { void account.refetch(); void gamification.refetch() }
  return <ProgressSubscreen screen={screen}>
    {error ? <ErrorState message={t('progressScreen.error')} action={<IconButton label={t('progressScreen.retry')} onClick={retry}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>} />
      : loading ? <ProgressLoading label={t('progressScreen.loading')} screen={screen} />
      : screen === 'streak' ? <StreakSection accountProfile={account.profile} canView={available} gamificationProfile={gamification.profile} />
      : <AchievementsSection gamificationAvailable={available} profile={gamification.profile} xpProgress={gamification.xpProgress} />}
  </ProgressSubscreen>
}

export function ProgressContent({ screen = 'overview' }: Readonly<{ screen?: ProgressSubmenuId | 'overview' }>) {
  if (screen === 'overview') return <ProgressOverview />
  if (screen === 'goals') return <ProgressGoalsContent />
  return <ProgressGamificationContent screen={screen} />
}
