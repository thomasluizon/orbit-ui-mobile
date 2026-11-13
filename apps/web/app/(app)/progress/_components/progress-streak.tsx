'use client'

import { useEffect, useId, useMemo, useRef, useState, type MouseEventHandler } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  buildProtectedDayLabels,
  buildStreakWeekDays,
  deriveStreakRepairState,
  extractBackendStatus,
  formatStreakDate,
  formatStreakRepairDates,
  getStreakRepairErrorMessageKey,
  getStreakTierLabelKey,
  type StreakRepairState,
} from '@orbit/shared/utils'
import { DayStrip } from '@/components/dates/day-strip'
import { StreakFigure } from '@/components/gamification/streak-figure'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { ErrorState } from '@/components/ui/error-state'
import { FreezeBank } from '@/components/ui/freeze-bank'
import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw, Snowflake } from '@/components/ui/icons'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { StatTile } from '@/components/ui/stat-tile'
import type { useGamificationProfile } from '@/hooks/use-gamification'
import { useRepairStreak, useStreakFreeze } from '@/hooks/use-gamification'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import type { useProfile } from '@/hooks/use-profile'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { LockedCard } from './locked-card'

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

export function RepairUnavailableCopy({ state }: Readonly<{
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

function StreakFreezeDetails({ freeze, repair, timeZone, longestStreak, currentStreak, repairOnScreen }: Readonly<{
  freeze: ReturnType<typeof useStreakFreeze>
  repair: ReturnType<typeof useRepairStreak>
  timeZone: string | null
  longestStreak: number
  currentStreak: number
  repairOnScreen: boolean
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
      {freeze.streakInfo && !(repairOnScreen && (repairState.showGap || repairState.gapUnavailable)) ? <StreakRepairPanel state={repairState} ceiling={freeze.maxStreakFreezesAccumulated} repair={repair} isDesktop={isDesktop} /> : null}
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

export type StreakScreenInputs = Readonly<{
  accountProfile: ReturnType<typeof useProfile>['profile']
  canView: boolean
  gamificationProfile: ReturnType<typeof useGamificationProfile>['profile']
}>

/** The reads both forms of Sequência share: the streak, the freezes and the repair request. */
export function useStreakScreen({ accountProfile, canView, gamificationProfile }: StreakScreenInputs) {
  const timeZone = accountProfile?.timeZone ?? null
  const freeze = useStreakFreeze(accountProfile, timeZone, canView)
  const repair = useRepairStreak(timeZone)
  const currentStreak = freeze.streakInfo?.currentStreak ?? gamificationProfile?.currentStreak ?? accountProfile?.currentStreak ?? 0
  const longestStreak = freeze.streakInfo?.longestStreak ?? gamificationProfile?.longestStreak ?? accountProfile?.longestStreak ?? 0
  return { timeZone, freeze, repair, currentStreak, longestStreak, loading: canView && !freeze.streakInfo }
}

export type StreakScreen = ReturnType<typeof useStreakScreen>

function StreakErrorSection({ headingId, onRetry }: Readonly<{ headingId: string; onRetry: () => void }>) {
  const t = useTranslations()
  return (
    <section aria-labelledby={headingId} className="flex w-full flex-col gap-4"><h2 id={headingId} className="sr-only">{t('progressScreen.sections.streak')}</h2>
      <ErrorState
        message={t('progressScreen.error')}
        action={<IconButton label={t('progressScreen.retry')} onClick={onRetry}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>}
      />
    </section>
  )
}

/** The current streak figure and the 14-day strip, with the skeleton in its place while the streak loads. */
export function StreakStrip({ streak }: Readonly<{ streak: StreakScreen }>) {
  const t = useTranslations()
  const locale = useLocale()
  const isDesktop = useIsDesktop()
  const { freeze, currentStreak, timeZone, loading } = streak
  const days = buildStreakWeekDays(freeze.streakInfo, currentStreak, freeze.isFrozenToday, new Date(), 14, timeZone ?? undefined, freeze.streakInfo?.firstEligibleDate)
  const labels = useMemo(() => days.map((day) => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(day.date)), [days, locale])
  const dayWords = {
    notScheduled: t('calendar.dayCell.notScheduled'),
    active: t('progressScreen.streak.active'),
    frozen: t('progressScreen.streak.frozen'),
    missed: t('progressScreen.streak.missed'),
    today: t('progressScreen.streak.today'),
  }
  return (
    <>
      <StreakFigure currentStreak={currentStreak} />
      <div role="group" aria-busy={loading} aria-label={loading ? t('progressScreen.loading') : undefined} className="relative min-w-0 w-full py-1">
        <div inert={loading || undefined} aria-hidden={loading || undefined} className={loading ? 'invisible' : undefined}>
          <DayStrip size={isDesktop ? 24 : 20} scope="account" days={days.map((day) => day.status)} labels={labels} label={t('progressScreen.streak.stripWindow', { count: days.length })} words={dayWords} />
        </div>
        {loading ? <div className="pointer-events-none absolute inset-0"><Skeleton variant="fill" grouped /></div> : null}
      </div>
    </>
  )
}

/** The Freezes row and the sheet it opens. With `repairOnScreen`, the gap and its repair stay on the screen and the sheet keeps the bank-full notice. */
export function StreakDetails({ streak, repairOnScreen = false }: Readonly<{ streak: StreakScreen; repairOnScreen?: boolean }>) {
  const t = useTranslations()
  const [detailsOpen, setDetailsOpen] = useAccountScopedState(false)
  const { sheetRef } = useSheetHost()
  const entryRef = useRef<HTMLElement>(null)
  const detailsId = useId()
  const { freeze, repair, timeZone, longestStreak, currentStreak, loading } = streak
  return (
    <>
      <StreakFreezeEntry loading={loading} banked={freeze.streakFreezesAccumulated} ceiling={freeze.maxStreakFreezesAccumulated} detailsOpen={detailsOpen} controls={detailsOpen ? detailsId : undefined} onClick={(event) => { entryRef.current = event.currentTarget; setDetailsOpen(true) }} />
      {detailsOpen ? <Sheet ref={sheetRef} finalFocus={entryRef} open title={t('progressScreen.streak.freezes')} onClose={() => setDetailsOpen(false)}>
        <div id={detailsId} className="flex flex-col gap-4">
          <StreakFreezeDetails freeze={freeze} repair={repair} timeZone={timeZone} longestStreak={longestStreak} currentStreak={currentStreak} repairOnScreen={repairOnScreen} />
        </div>
      </Sheet> : null}
    </>
  )
}

export function StreakLockedFigures({ longestStreak, currentStreak }: Readonly<{ longestStreak: number; currentStreak: number }>) {
  const t = useTranslations()
  return (
    <>
      <div className="flex flex-wrap gap-4"><StatTile value={longestStreak} label={t('progressScreen.streak.longest')} /><StatTile value={t(getStreakTierLabelKey(currentStreak))} label={t('streakDisplay.detail.tierTileLabel')} /></div>
      <LockedCard title={t('progressScreen.streak.lockedTitle')} body={t('progressScreen.streak.lockedBody')} action={t('progressScreen.streak.lockedAction')} />
    </>
  )
}

export function StreakSection(inputs: StreakScreenInputs) {
  const headingId = useId()
  const t = useTranslations()
  const streak = useStreakScreen(inputs)
  if (inputs.canView && streak.freeze.streakQuery.isError) return <StreakErrorSection headingId={headingId} onRetry={() => void streak.freeze.streakQuery.refetch()} />
  return (
    <section aria-labelledby={headingId} aria-busy={streak.loading} data-progress-streak-summary="" className="flex w-full flex-col gap-4"><h2 id={headingId} className="sr-only">{t('progressScreen.sections.streak')}</h2>
      <StreakStrip streak={streak} />
      {inputs.canView ? <StreakDetails streak={streak} /> : <StreakLockedFigures longestStreak={streak.longestStreak} currentStreak={streak.currentStreak} />}
    </section>
  )
}
