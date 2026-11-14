import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react'
import { AccessibilityInfo, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import { NestableScrollContainer } from 'react-native-draggable-flatlist'
import { ScrollView as GestureScrollView } from 'react-native-gesture-handler'
import { PADDING, SPACING } from '@orbit/shared/theme'
import type { ProgressGoalFilter } from '@orbit/shared/utils'
import { CreateGoalSheet } from '@/components/goals/create-goal-sheet'
import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'
import { ShellCentredRegion } from '@/components/shell/shell-centred-region'
import { useShellPageEnd } from '@/components/shell/shell-scroller-clearance'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'
import { useFlag } from '@/hooks/use-flag'
import { useGoals } from '@/hooks/use-goals'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { usePrefersReducedMotion } from '@/lib/motion'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { ProgressLoading } from '../progress-loading'
import { ProgressSubscreen } from '../progress-subscreen'
import { GoalsSection } from './goals-section'
import { useGoalSeenProgress } from './use-goal-seen-progress'

/** The empty goals list: Orbit at rest at the state size, the title and one action. */
function GoalsEmptyState({ onCreate }: Readonly<{ onCreate: () => void }>) {
  const { t } = useTranslation()
  const { width } = useWindowDimensions()
  return <EmptyState title={t('progressScreen.goals.empty')} action={<PillButton variant={width >= 768 ? 'secondary' : 'primary'} size="sm" onClick={onCreate}>{t('progressScreen.goals.createAction')}</PillButton>} />
}

function ProgressPageHeading({ focusRef, title }: Readonly<{ focusRef: RefObject<Text | null>; title: string }>) {
  return <Text ref={focusRef} testID="progress-screen-heading" accessible style={styles.screenReaderTitle}>{title}</Text>
}

/** Focus returns to the card the person opened or created, or to the page heading. */
function useGoalFocusReturn(creating: boolean, createdGoalId: string | null, detailGoalId: string | null) {
  const openingGoalIdRef = useRef<string | null>(null)
  const goalCardRefs = useRef(new Map<string, View>())
  const pageHeadingRef = useRef<Text>(null)
  const registerGoalCard = useCallback((goalId: string, instance: View | null) => {
    if (instance) goalCardRefs.current.set(goalId, instance)
    else goalCardRefs.current.delete(goalId)
  }, [])
  const focusGoal = (goalId: string) => {
    const destination = goalCardRefs.current.get(goalId) ?? pageHeadingRef.current
    if (destination) AccessibilityInfo.sendAccessibilityEvent(destination, 'focus')
  }
  useEffect(() => {
    const openingGoalId = openingGoalIdRef.current
    if (detailGoalId || !openingGoalId) return
    focusGoal(openingGoalId)
    openingGoalIdRef.current = null
  }, [detailGoalId])
  useEffect(() => {
    if (!creating && createdGoalId) focusGoal(createdGoalId)
  }, [creating, createdGoalId])
  return { openingGoalIdRef, registerGoalCard, pageHeadingRef }
}

export function ProgressGoalsContent() {
  const { t } = useTranslation()
  const guided = useFlag('orbit_guided_flows')
  const reducedMotion = usePrefersReducedMotion()
  const [goalFilter, setGoalFilter] = useAccountScopedState<ProgressGoalFilter>('all')
  const [creating, setCreating] = useAccountScopedState(false)
  const [createdGoalId, setCreatedGoalId] = useAccountScopedState<string | null>(null)
  const [detailGoalId, setDetailGoalId] = useAccountScopedState<string | null>(null)
  const openCreateGoal = () => { setCreatedGoalId(null); setCreating(true) }
  const scrollRef = useRef<GestureScrollView>(null)
  const clearance = useShellPageEnd().paddingBottom
  const focus = useGoalFocusReturn(creating, createdGoalId, detailGoalId)
  const theme = useAppTheme()
  const tokens = useMemo(() => createTokensV2(theme.currentScheme, theme.currentTheme), [theme.currentScheme, theme.currentTheme])
  const goals = useGoals()
  const allGoals = goals.data?.allGoals ?? []
  const seen = useGoalSeenProgress(allGoals, guided, !reducedMotion)
  const error = goals.isError
  const loading = !error && (goals.isLoading || !seen.ready)
  const empty = !loading && !error && allGoals.length === 0
  const retry = () => { void goals.refetch() }
  const openGoal = useCallback((goalId: string) => {
    focus.openingGoalIdRef.current = goalId
    setDetailGoalId(goalId)
  }, [focus.openingGoalIdRef, setDetailGoalId])
  return (
    <ProgressSubscreen screen="goals" hideHeader={detailGoalId !== null}>
      {creating ? <CreateGoalSheet open onCreated={(goalId) => { setGoalFilter('all'); setCreatedGoalId(goalId) }} onOpenGoal={(goalId) => { setCreatedGoalId(null); openGoal(goalId) }} onClose={() => setCreating(false)} /> : null}
      {detailGoalId ? <ScrollView style={[styles.root, { backgroundColor: tokens.bg }]} contentContainerStyle={[styles.sections, { paddingBottom: clearance }]}><GoalDetailDrawer key={detailGoalId} inline open onClose={() => setDetailGoalId(null)} goalId={detailGoalId} /></ScrollView> : null}
    <NestableScrollContainer ref={scrollRef} testID="progress-goals-scroller" style={[styles.root, { backgroundColor: tokens.bg }, detailGoalId ? { display: 'none' } : undefined]} contentContainerStyle={[styles.content, styles.fill, { paddingBottom: clearance }]} showsVerticalScrollIndicator={false}>
      <View testID="progress-sections" style={[styles.sections, styles.fill]}>
        <ProgressPageHeading focusRef={focus.pageHeadingRef} title={t('progressScreen.sections.goals')} />
        {loading ? <ProgressLoading label={t('progressScreen.loading')} screen="goals" /> : null}
        {error ? <View style={styles.error}><ErrorState message={t('progressScreen.error')} action={<IconButton label={t('progressScreen.retry')} onClick={retry}><RefreshCw size={20} strokeWidth={1.5} accessible={false} /></IconButton>} /></View> : null}
        {empty ? <ShellCentredRegion><GoalsEmptyState onCreate={openCreateGoal} /></ShellCentredRegion> : null}
        {!loading && !error && !empty ? <GoalsSection filter={goalFilter} setFilter={setGoalFilter} onCreate={openCreateGoal} onOpenGoal={openGoal} onRegisterGoal={focus.registerGoalCard} goals={allGoals} tokens={tokens} sweepFrom={seen.sweepFrom} onSwept={seen.markSwept} /> : null}
      </View>
    </NestableScrollContainer>
    </ProgressSubscreen>
  )
}

const styles = StyleSheet.create({
  screenReaderTitle: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', color: 'transparent' },
  root: { flex: 1 }, content: { gap: PADDING.sectionStackGap }, sections: { gap: PADDING.sectionStackGap, paddingHorizontal: PADDING.screenGutter, paddingVertical: SPACING.s16 }, fill: { flexGrow: 1 },
  error: { width: '100%' },
})
