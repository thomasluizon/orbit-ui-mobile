import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import { PADDING, SPACING } from '@orbit/shared/theme'
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
import type { useProfile } from '@/hooks/use-profile'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import type { AppTokensV2 } from '@/lib/theme'
import { LockedCard } from './locked-card'
import { WindowFigureGrid } from './progress-window'
import { progressStyles } from './progress-styles'

function FrozenTodayStatus({ isFrozenToday, tokens }: Readonly<{ isFrozenToday: boolean; tokens: AppTokensV2 }>) {
  const { t } = useTranslation()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => { if (active) setMounted(true) })
    return () => { active = false }
  }, [])
  const showMessage = mounted && isFrozenToday
  return (
    <View accessible accessibilityLiveRegion="polite" accessibilityLabel={showMessage ? t('progressScreen.streak.frozenToday') : ''} style={showMessage ? [styles.frozenBanner, { backgroundColor: tokens.bgWell }] : progressStyles.screenReaderTitle}>
      {showMessage ? <><Snowflake size={20} strokeWidth={2} color={tokens.statusFrozen} /><Text style={[styles.frozenCopy, { color: tokens.fg2 }]}>{t('progressScreen.streak.frozenToday')}</Text></> : null}
    </View>
  )
}

function FreezeCoveredStatus({ date, remaining, origin, locale, tokens }: Readonly<{
  date: string
  remaining: number
  origin?: string | null
  locale: string
  tokens: AppTokensV2
}>) {
  const { t } = useTranslation()
  const message = t(origin === 'automatic' ? 'progressScreen.streak.automaticCovered' : 'progressScreen.streak.covered', {
    date: formatStreakDate(date, locale),
    count: remaining,
  })
  return (
    <View accessible accessibilityLiveRegion="polite" accessibilityLabel={message} style={[styles.frozenBanner, { backgroundColor: tokens.bgWell }]}>
      <Snowflake size={20} strokeWidth={2} color={tokens.statusFrozen} />
      <Text style={[styles.frozenCopy, { color: tokens.fg2 }]}>{message}</Text>
    </View>
  )
}

export function RepairUnavailableCopy({ state, tokens }: Readonly<{
  state: StreakRepairState
  tokens: AppTokensV2
}>) {
  const { t } = useTranslation()
  const message = state.banked === 0
    ? t('progressScreen.streak.repairEmpty')
    : state.bankFull
      ? t('progressScreen.streak.repairCapped', { needed: state.count, banked: state.banked })
      : t('progressScreen.streak.repairPartial', { needed: state.count, banked: state.banked })
  return <Text style={[progressStyles.body, { color: tokens.fg2 }]}>{message}</Text>
}

function StreakRepairPanel({ state, ceiling, repair, tokens, isWide }: Readonly<{
  state: StreakRepairState
  ceiling: number
  repair: ReturnType<typeof useRepairStreak>
  tokens: AppTokensV2
  isWide: boolean
}>) {
  const { t, i18n } = useTranslation()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const repairStatus = extractBackendStatus(repair.error)
  if (state.gapUnavailable) {
    return (
      <View style={[styles.gapWell, { backgroundColor: tokens.bgWell }]}>
        <Text style={[styles.gapBody, { color: tokens.fg1 }]}>{t('progressScreen.streak.gapUnavailable')}</Text>
      </View>
    )
  }
  if (state.showGap) {
    const datesLabel = formatStreakRepairDates(state.dates, i18n.language)
    return (
      <>
        <View style={[styles.gapWell, { backgroundColor: tokens.bgWell }]}>
          <Text style={[styles.gapBody, { color: tokens.fg1 }]}>{t('progressScreen.streak.gapBody', { count: state.count })}</Text>
          {state.canRepair ? <View style={progressStyles.actionStart}><PillButton variant={isWide ? 'secondary' : 'primary'} size="sm" loading={repair.isPending} onClick={() => setConfirmOpen(true)}>{t('progressScreen.streak.repairAction', { dates: datesLabel })}</PillButton></View> : null}
          {!state.canRepair ? <RepairUnavailableCopy state={state} tokens={tokens} /> : null}
          {repair.isError && repairStatus !== 409 ? <Text accessibilityRole="alert" style={[progressStyles.body, { color: tokens.statusBadText }]}>{t(getStreakRepairErrorMessageKey(repairStatus))}</Text> : null}
        </View>
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

function StreakFreezeDetails({ freeze, repair, timeZone, longestStreak, currentStreak, tokens, repairOnScreen }: Readonly<{
  freeze: ReturnType<typeof useStreakFreeze>
  repair: ReturnType<typeof useRepairStreak>
  timeZone: string | null
  longestStreak: number
  currentStreak: number
  tokens: AppTokensV2
  repairOnScreen: boolean
}>) {
  const { t, i18n } = useTranslation()
  const { width } = useWindowDimensions()
  const tier = t(getStreakTierLabelKey(currentStreak))
  const repairState = deriveStreakRepairState({
    streak: freeze.streakInfo,
    freezesAvailable: freeze.freezesAvailable,
    banked: freeze.streakFreezesAccumulated,
    ceiling: freeze.maxStreakFreezesAccumulated,
    now: new Date(),
    accountTimeZone: timeZone,
  })
  const dayWords = { active: t('progressScreen.streak.active'), frozen: t('progressScreen.streak.frozen'), missed: t('progressScreen.streak.missed'), today: t('progressScreen.streak.today') }
  return (
    <>
      {repairOnScreen ? <Text testID="freeze-summary" style={[styles.summary, { color: tokens.fg2 }]}>{t('progressScreen.streak.freezeSummary', { ceiling: freeze.maxStreakFreezesAccumulated })}</Text> : null}
      <FrozenTodayStatus isFrozenToday={freeze.isFrozenToday} tokens={tokens} />
      {freeze.streakInfo?.lastFreezeCoveredDate && freeze.streakInfo.freezeBankRemaining != null ? <FreezeCoveredStatus date={freeze.streakInfo.lastFreezeCoveredDate} remaining={freeze.streakInfo.freezeBankRemaining} origin={freeze.streakInfo.lastFreezeCoveredOrigin} locale={i18n.language} tokens={tokens} /> : null}
      <FreezeBank inSheet loadingLabel={!freeze.streakInfo ? t('progressScreen.loading') : undefined} banked={freeze.streakFreezesAccumulated} ceiling={freeze.maxStreakFreezesAccumulated} usedThisMonth={freeze.freezesUsedThisMonth} longestValue={longestStreak} longestLabel={t('progressScreen.streak.longest')} daysTowardNext={Math.max(0, 7 - freeze.daysUntilNextFreeze)} earnRateDays={7} tierValue={tier} tierLabel={t('streakDisplay.detail.tierTileLabel')} protectedDays={buildProtectedDayLabels(freeze.streakInfo?.recentFreezeDates ?? [], i18n.language, freeze.isFrozenToday, timeZone ?? undefined)} words={{ ...dayWords, legendLabel: t('progressScreen.streak.legend'), bankedLabel: t('progressScreen.streak.banked'), usedLabel: t('progressScreen.streak.used'), nextLabel: t('progressScreen.streak.next'), nextProgressLabel: t('progressScreen.streak.nextProgress'), nextFreezeProgress: t('progressScreen.streak.nextOf', { current: Math.max(0, 7 - freeze.daysUntilNextFreeze), total: 7 }), protectedLabel: t('progressScreen.streak.protectedDays'), protectedEmpty: t('progressScreen.streak.protectedEmpty'), protectedDay: t('progressScreen.streak.protected'), protectedToday: t('progressScreen.streak.protectedToday') }} />
      {freeze.streakInfo && !(repairOnScreen && (repairState.showGap || repairState.gapUnavailable)) ? <StreakRepairPanel state={repairState} ceiling={freeze.maxStreakFreezesAccumulated} repair={repair} tokens={tokens} isWide={width >= 768} /> : null}
    </>
  )
}

function StreakFreezeEntry({ loading, banked, ceiling, detailsOpen, onClick }: Readonly<{
  loading: boolean
  banked: number
  ceiling: number
  detailsOpen: boolean
  onClick: () => void
}>) {
  const { t } = useTranslation()
  const label = t('progressScreen.streak.freezes')
  const value = `${banked} / ${ceiling}`
  return (
    <ListRow placement="column" textMode="label" title={label} accessibilityLabel={loading ? label : t('progressScreen.streak.freezesCount', { banked, ceiling })} expanded={detailsOpen} disabled={loading} valueHidden={loading} value={value} chevron onClick={onClick} />
  )
}

export type StreakScreenInputs = Readonly<{
  accountProfile: ReturnType<typeof useProfile>['profile']
  canView: boolean
  gamificationProfile: ReturnType<typeof useGamificationProfile>['profile']
  tokens: AppTokensV2
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

function StreakErrorSection({ onRetry }: Readonly<{ onRetry: () => void }>) {
  const { t } = useTranslation()
  return <View testID="progress-streak-section" style={styles.streakSection}><Text accessibilityRole="header" style={progressStyles.screenReaderTitle}>{t('progressScreen.sections.streak')}</Text><ErrorState message={t('progressScreen.error')} action={<IconButton label={t('progressScreen.retry')} onClick={onRetry}><RefreshCw size={20} strokeWidth={1.5} accessible={false} /></IconButton>} /></View>
}

/** The current streak figure and the 14-day strip, with the skeleton in its place while the streak loads. */
export function StreakStrip({ streak, tokens }: Readonly<{ streak: StreakScreen; tokens: AppTokensV2 }>) {
  const { t, i18n } = useTranslation()
  const { width } = useWindowDimensions()
  const { freeze, currentStreak, timeZone, loading } = streak
  const days = buildStreakWeekDays(freeze.streakInfo, currentStreak, freeze.isFrozenToday, new Date(), 14, timeZone ?? undefined, freeze.streakInfo?.firstEligibleDate)
  const labels = useMemo(() => days.map((day) => new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric' }).format(day.date)), [days, i18n.language])
  const dayWords = { notScheduled: t('calendar.dayCell.notScheduled'), active: t('progressScreen.streak.active'), frozen: t('progressScreen.streak.frozen'), missed: t('progressScreen.streak.missed'), today: t('progressScreen.streak.today') }
  return (
    <>
      <StreakFigure currentStreak={currentStreak} tokens={tokens} />
      <View accessible={loading} accessibilityState={{ busy: loading }} accessibilityLabel={loading ? t('progressScreen.loading') : undefined}>
        <View accessibilityElementsHidden={loading} importantForAccessibility={loading ? 'no-hide-descendants' : 'auto'} style={loading && styles.hidden}>
          <DayStrip size={width >= 768 ? 24 : 20} scope="account" days={days.map((day) => day.status)} labels={labels} label={t('progressScreen.streak.stripWindow', { count: days.length })} words={dayWords} />
        </View>
        {loading ? <View pointerEvents="none" style={StyleSheet.absoluteFill}><Skeleton variant="fill" grouped /></View> : null}
      </View>
    </>
  )
}

/** The Freezes row and the sheet it opens. With `repairOnScreen`, the sheet opens on one sentence about what a freeze does, the gap and its repair stay on the screen, and the sheet keeps the bank-full notice. */
export function StreakDetails({ streak, tokens, repairOnScreen = false }: Readonly<{ streak: StreakScreen; tokens: AppTokensV2; repairOnScreen?: boolean }>) {
  const { t } = useTranslation()
  const [detailsOpen, setDetailsOpen] = useAccountScopedState(false)
  const { sheetRef } = useSheetHost()
  const { freeze, repair, timeZone, longestStreak, currentStreak, loading } = streak
  return (
    <>
      <StreakFreezeEntry loading={loading} banked={freeze.streakFreezesAccumulated} ceiling={freeze.maxStreakFreezesAccumulated} detailsOpen={detailsOpen} onClick={() => setDetailsOpen(true)} />
      {detailsOpen ? <Sheet ref={sheetRef} open title={t('progressScreen.streak.freezes')} onClose={() => setDetailsOpen(false)}>
        <View style={styles.streakSection}>
          <StreakFreezeDetails freeze={freeze} repair={repair} timeZone={timeZone} longestStreak={longestStreak} currentStreak={currentStreak} tokens={tokens} repairOnScreen={repairOnScreen} />
        </View>
      </Sheet> : null}
    </>
  )
}

export function StreakLockedFigures({ longestStreak, currentStreak, tokens }: Readonly<{ longestStreak: number; currentStreak: number; tokens: AppTokensV2 }>) {
  const { t } = useTranslation()
  return (
    <>
      <WindowFigureGrid><StatTile value={longestStreak} label={t('progressScreen.streak.longest')} /><StatTile value={t(getStreakTierLabelKey(currentStreak))} label={t('streakDisplay.detail.tierTileLabel')} /></WindowFigureGrid>
      <LockedCard title={t('progressScreen.streak.lockedTitle')} body={t('progressScreen.streak.lockedBody')} action={t('progressScreen.streak.lockedAction')} tokens={tokens} />
    </>
  )
}

export function StreakSection(inputs: StreakScreenInputs) {
  const { t } = useTranslation()
  const streak = useStreakScreen(inputs)
  if (inputs.canView && streak.freeze.streakQuery.isError) return <StreakErrorSection onRetry={() => void streak.freeze.streakQuery.refetch()} />
  return (
    <View accessibilityState={{ busy: streak.loading }} testID="progress-streak-section" style={styles.streakSection}><Text accessibilityRole="header" style={progressStyles.screenReaderTitle}>{t('progressScreen.sections.streak')}</Text>
      <StreakStrip streak={streak} tokens={inputs.tokens} />
      {inputs.canView ? <StreakDetails streak={streak} tokens={inputs.tokens} /> : <StreakLockedFigures longestStreak={streak.longestStreak} currentStreak={streak.currentStreak} tokens={inputs.tokens} />}
    </View>
  )
}

const styles = StyleSheet.create({
  frozenBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, padding: SPACING.s12 },
  frozenCopy: { flex: 1, fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
  gapBody: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24 },
  gapWell: { borderRadius: 12, gap: 12, padding: PADDING.recordInset },
  hidden: { opacity: 0 },
  streakSection: { width: '100%', gap: 16 },
  summary: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24 },
})
