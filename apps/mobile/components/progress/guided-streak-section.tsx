import { useEffect } from 'react'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import { PADDING } from '@orbit/shared/theme'
import {
  deriveStreakRepairState,
  extractBackendStatus,
  formatStreakRepairDates,
  getStreakRepairErrorMessageKey,
  resolveStreakOrbitLine,
  type StreakRepairState,
} from '@orbit/shared/utils'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { PillButton } from '@/components/ui/pill-button'
import { ResultDialog } from '@/components/ui/result-dialog'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import type { AppTokensV2 } from '@/lib/theme'
import {
  RepairUnavailableCopy,
  StreakDetails,
  StreakLockedFigures,
  StreakStrip,
  useStreakScreen,
  type StreakScreen,
  type StreakScreenInputs,
} from './progress-streak'
import { progressStyles } from './progress-styles'
import { ProgressSurfaceError } from './progress-surface-error'
import { StreakRepairFlow } from './streak-repair-flow'

function repairStateOf(streak: StreakScreen): StreakRepairState {
  const { freeze, timeZone } = streak
  return deriveStreakRepairState({
    streak: freeze.streakInfo,
    freezesAvailable: freeze.freezesAvailable,
    banked: freeze.streakFreezesAccumulated,
    ceiling: freeze.maxStreakFreezesAccumulated,
    now: new Date(),
    accountTimeZone: timeZone,
  })
}

/** Orbit at 48 beside one fact. Orbit is Parado in every state of Sequência, the gap included, and the line is absent behind the Pro gate. */
function StreakOrbitRow({ line, tokens }: Readonly<{ line: string | null; tokens: AppTokensV2 }>) {
  return (
    <View testID="streak-orbit" style={styles.orbitRow}>
      <View style={styles.orbitSlot} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden><OrbitMascot size={48} state="parado" /></View>
      {line ? <Text testID="streak-orbit-line" style={[styles.line, { color: tokens.fg2 }]}>{line}</Text> : null}
    </View>
  )
}

/** The return path of a gap, on the screen: the repair action, or why the gap cannot be repaired. */
function StreakGapActions({ state, repair, tokens, onRepair }: Readonly<{
  state: StreakRepairState
  repair: StreakScreen['repair']
  tokens: AppTokensV2
  onRepair: () => void
}>) {
  const { t, i18n } = useTranslation()
  const { width } = useWindowDimensions()
  const status = extractBackendStatus(repair.error)
  if (!state.showGap) return null
  return (
    <View testID="streak-repair" style={[styles.gapWell, { backgroundColor: tokens.bgWell }]}>
      {state.canRepair
        ? <View style={progressStyles.actionStart}><PillButton variant={width >= 768 ? 'secondary' : 'primary'} size="sm" onClick={onRepair}>{t('progressScreen.streak.repairAction', { dates: formatStreakRepairDates(state.dates, i18n.language) })}</PillButton></View>
        : <RepairUnavailableCopy state={state} tokens={tokens} />}
      {repair.isError && status !== 409 ? <Text accessibilityRole="alert" style={[progressStyles.body, { color: tokens.statusBadText }]}>{t(getStreakRepairErrorMessageKey(status))}</Text> : null}
    </View>
  )
}

/** The flow stays open while the gap can still be repaired. A refreshed streak with no gap closes it. */
function useRepairFlow(state: StreakRepairState, repair: StreakScreen['repair']) {
  const [open, setOpen] = useAccountScopedState(false)
  const [repairedCount, setRepairedCount] = useAccountScopedState<number | null>(null)
  const repairable = state.showGap && state.canRepair
  useEffect(() => {
    if (open && !repair.isPending && !repairable && repairedCount === null) setOpen(false)
  }, [open, repair.isPending, repairable, repairedCount, setOpen])
  return {
    open,
    repairedCount,
    start: () => { repair.reset(); setOpen(true) },
    close: () => setOpen(false),
    repaired: (count: number) => { setOpen(false); setRepairedCount(count) },
    dismissResult: () => setRepairedCount(null),
  }
}

/** Sequência under `orbit_guided_flows`: Orbit states the streak, and a gap shows its return path on the screen. */
export function GuidedStreakSection(inputs: StreakScreenInputs) {
  const { t } = useTranslation()
  const streak = useStreakScreen(inputs)
  const repairState = repairStateOf(streak)
  const flow = useRepairFlow(repairState, streak.repair)
  if (inputs.canView && streak.freeze.streakQuery.isError) return <ProgressSurfaceError onRetry={() => void streak.freeze.streakQuery.refetch()} />
  const { freeze } = streak
  const line = inputs.canView && freeze.streakInfo ? resolveStreakOrbitLine({
    repair: repairState,
    currentStreak: streak.currentStreak,
    banked: freeze.streakFreezesAccumulated,
    ceiling: freeze.maxStreakFreezesAccumulated,
    daysUntilNextFreeze: freeze.daysUntilNextFreeze,
  }) : null
  return (
    <View accessibilityState={{ busy: streak.loading }} testID="progress-streak-section" style={styles.section}><Text accessibilityRole="header" style={progressStyles.screenReaderTitle}>{t('progressScreen.sections.streak')}</Text>
      <StreakOrbitRow line={line ? t(line.key, line.values) : null} tokens={inputs.tokens} />
      <StreakStrip streak={streak} tokens={inputs.tokens} />
      {inputs.canView && freeze.streakInfo ? <StreakGapActions state={repairState} repair={streak.repair} tokens={inputs.tokens} onRepair={flow.start} /> : null}
      {inputs.canView ? <StreakDetails streak={streak} tokens={inputs.tokens} repairOnScreen /> : <StreakLockedFigures longestStreak={streak.longestStreak} currentStreak={streak.currentStreak} tokens={inputs.tokens} />}
      {flow.open ? <StreakRepairFlow state={repairState} repair={streak.repair} onClose={flow.close} onRepaired={flow.repaired} /> : null}
      {flow.repairedCount !== null ? <ResultDialog title={t('result.title')} sentence={t('result.streak.repaired', { count: flow.repairedCount })} primaryLabel={t('result.streak.see')} onPrimary={flow.dismissResult} onClose={flow.dismissResult} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { width: '100%', gap: 16 },
  orbitRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  orbitSlot: { width: 48, alignItems: 'center' },
  line: { flex: 1, minWidth: 0, fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24 },
  gapWell: { borderRadius: 12, gap: 12, padding: PADDING.recordInset },
})
