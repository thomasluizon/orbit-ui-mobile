import { usePrefersReducedMotion } from '@/lib/motion'
import { ContentFade } from '@/components/motion/content-fade'
import { createListCellMotion } from '@/lib/list-motion'
import { IconButton } from '@/components/ui/icon-button'
import { PADDING, SPACING, SMALL_PILL_VISIBLE_MIN } from '@orbit/shared/theme'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { ActionRow } from '@/components/ui/action-row'
import { CreateGoalSheet } from '@/components/goals/create-goal-sheet'
import { PersonalText } from '@/components/ui/personal-text'
import type { ProgressSubmenuId } from '@orbit/shared/utils/progress-navigation'
import { ProgressSubscreen } from './progress-subscreen'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { AccessibilityInfo, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  NestableDraggableFlatList,
  NestableScrollContainer,
  type DragEndParams,
  type RenderItemParams,
} from 'react-native-draggable-flatlist'
import type { Goal, GoalPositionItem } from '@orbit/shared/types/goal'
import {
  buildGoalMovePositions,
  filterProgressGoals,
  getProgressGoalLabelKey,
  type ProgressGoalFilter,
} from '@orbit/shared/utils'
import { Badge } from '@/components/ui/badge'
import { MotionPressable } from '@/components/ui/motion-pressable'
import { useGoalDrag } from './use-goal-drag'
import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'
import { EmptyState } from '@/components/ui/empty-state'
import { ShellCentredRegion } from '@/components/shell/shell-centred-region'
import { ErrorState } from '@/components/ui/error-state'
import { RefreshCw, Plus } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'
import { ProgressRing } from '@/components/ui/progress-ring'
import * as Menu from '@/components/ui/dropdown-menu'
import { StatusRing } from '@/components/ui/status-ring'
import { useGoals, useReorderGoals } from '@/hooks/use-goals'
import { createTokensV2, shadowsV2, type AppTokensV2 } from '@/lib/theme'
import { ScrollView as GestureScrollView } from 'react-native-gesture-handler'
import { useShellPageEnd } from '@/components/shell/shell-scroller-clearance'
import { useAppTheme } from '@/lib/use-app-theme'
import { ProgressGamificationRoute } from './progress-gamification-content'
import { ProgressLoading } from './progress-loading'
import { ProgressOverviewRoute } from './progress-overview'

function GoalIndicator({ goal }: Readonly<{ goal: Goal }>) {
  const { t } = useTranslation()
  if (goal.status === 'Abandoned') return null
  const label = t('goals.progressPercentage', { pct: Math.round(goal.progressPercentage) })
  if (goal.status === 'Completed' || goal.progressPercentage >= 100) return <StatusRing status="done" size={30} label={label} />
  return <ProgressRing value={goal.progressPercentage} size={44} label={label} />
}

function GoalCard({ goal, index, total, canReorder, isDragging, onDrag, onMove, onOpen, onRegister, tokens }: Readonly<{
  goal: Goal; index: number; total: number; canReorder: boolean; isDragging: boolean; onDrag?: () => void; onMove: (goalId: string, target: number) => void; onOpen: () => void; onRegister: (goalId: string, instance: View | null) => void; tokens: AppTokensV2
}>) {
  const { t } = useTranslation()
  const { suppressPress, ...gesture } = useGoalDrag(canReorder ? onDrag : undefined)
  const focusRef = useRef<View>(null)
  useEffect(() => {
    onRegister(goal.id, focusRef.current)
    return () => onRegister(goal.id, null)
  }, [goal.id, onRegister])
  const labelKey = getProgressGoalLabelKey(goal)
  const abandoned = goal.status === 'Abandoned'
  const state = t(labelKey ?? 'goals.status.active')
  const position = t('progressScreen.goals.position', { position: index + 1, total })
  const accessibilityLabel = abandoned
    ? t('progressScreen.goals.accessibleLabelWithoutProgress', { title: goal.title, state, position })
    : t('progressScreen.goals.accessibleLabel', {
        title: goal.title,
        state,
        progress: t('progressScreen.goals.progress', { current: goal.currentValue, target: goal.targetValue, unit: goal.unit }),
        position,
      })
  return (
    <MotionPressable ref={focusRef} testID={`goal-card-${goal.id}`} active={isDragging} accessible accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      accessibilityHint={canReorder ? t('progressScreen.goals.reorderHint') : undefined}
      accessibilityActions={canReorder ? [{ name: 'decrement', label: t('progressScreen.goals.moveUp') }, { name: 'increment', label: t('progressScreen.goals.moveDown') }] : undefined}
      onAccessibilityAction={canReorder ? (event) => {
        const action = event.nativeEvent.actionName
        if (action === 'decrement' || action === 'increment') onMove(goal.id, index + (action === 'decrement' ? -1 : 1))
      } : undefined}
      {...gesture} onPress={() => { if (!suppressPress()) onOpen() }}
      style={({ pressed }) => [
        styles.goalCard,
        { backgroundColor: pressed ? tokens.bgHover : tokens.bgCard, borderColor: tokens.hairlineGhost },
        isDragging ? { ...shadowsV2.shadow2, borderColor: tokens.hairlineStrong, opacity: 0.5, zIndex: 2 } : null,
      ]}>
      <View style={styles.goalCopy}>
        <PersonalText ellipsizeMode="tail" style={[styles.goalTitle, { color: abandoned ? tokens.fg2 : tokens.fg1 }]}>{goal.title}</PersonalText>
        <View style={styles.goalMeta}>
          {labelKey ? <Badge variant={abandoned ? 'outline' : 'solid'}>{t(labelKey)}</Badge> : null}
          {!abandoned ? <Text style={[styles.meta, { color: tokens.fg2 }]}>{t('progressScreen.goals.progress', { current: goal.currentValue, target: goal.targetValue, unit: goal.unit })}</Text> : null}
        </View>
      </View>
      <GoalIndicator goal={goal} />
    </MotionPressable>
  )
}

function GoalsEmptyState({ tokens, inSection = false, onCreate }: Readonly<{ tokens: AppTokensV2; inSection?: boolean; onCreate: () => void }>) {
  const { t } = useTranslation()
  const { width } = useWindowDimensions()
  const action = <PillButton variant={width >= 768 ? 'secondary' : 'primary'} size="sm" onClick={onCreate}>{t('progressScreen.goals.createAction')}</PillButton>

  if (!inSection) return <EmptyState title={t('progressScreen.goals.empty')} action={action} />
  return <View style={[styles.emptyLine, { backgroundColor: tokens.bgWell }]}><Text style={[styles.body, { color: tokens.fg2 }]}>{t('progressScreen.goals.empty')}</Text>{action}</View>
}

function GoalsSection({ goals, tokens, onOpenGoal, onRegisterGoal, onCreate, filter, setFilter }: Readonly<{ goals: readonly Goal[]; tokens: AppTokensV2; onCreate: () => void; filter: ProgressGoalFilter; setFilter: (filter: ProgressGoalFilter) => void; onOpenGoal: (goalId: string) => void; onRegisterGoal: (goalId: string, instance: View | null) => void }>) {
  const { t } = useTranslation()

  const reorder = useReorderGoals()
  const reducedListMotion = usePrefersReducedMotion()
  const [filterOpen, setFilterOpen] = useState(false)
  const changeFilter = (next: ProgressGoalFilter) => {
    setFilter(next)
  }
  const announceReorderResult = (message: string) => {
    AccessibilityInfo.announceForAccessibility(message)
  }
  const filtered = filterProgressGoals(goals, filter)
  const options = [{ value: 'all', label: t('progressScreen.goals.all') }, { value: 'active', label: t('progressScreen.goals.active') }, { value: 'completed', label: t('progressScreen.goals.completed') }, { value: 'abandoned', label: t('progressScreen.goals.abandoned') }] as const
  const commitMove = (positions: GoalPositionItem[], goalId: string, target: number) => {
    const goal = goals.find((item) => item.id === goalId)
    if (!goal) return
    reorder.mutate(positions, {
      onSuccess: () => announceReorderResult(t('progressScreen.goals.reorderMoved', { title: goal.title, position: target + 1, total: goals.length })),
    })
  }
  const handleDragEnd = ({ data, from, to }: DragEndParams<Goal>) => {
    if (filter !== 'all' || reorder.isPending || from === to) {
      return
    }
    const positions: GoalPositionItem[] = data.map((goal, position) => ({ id: goal.id, position }))
    reorder.mutate(positions)
  }
  const move = (goalId: string, target: number) => {
    const currentIndex = goals.findIndex((item) => item.id === goalId)
    const goal = goals[currentIndex]
    if (!goal) return
    const boundedTarget = Math.max(0, Math.min(goals.length - 1, target))
    const positions = buildGoalMovePositions(goals, goalId, target)
    if (!positions) {
      announceReorderResult(t('progressScreen.goals.reorderBoundary', { title: goal.title, position: currentIndex + 1, total: goals.length }))
      return
    }
    commitMove(positions, goalId, boundedTarget)
  }
  const cellMotion = createListCellMotion(reducedListMotion)
  const renderGoal = ({ item, getIndex, drag, isActive }: RenderItemParams<Goal>) => {
    const index = getIndex() ?? goals.findIndex((goal) => goal.id === item.id)
    return <GoalCard goal={item} index={index} total={goals.length} canReorder={filter === 'all' && !reorder.isPending} isDragging={isActive} onDrag={drag} onMove={move} onOpen={() => onOpenGoal(item.id)} onRegister={onRegisterGoal} tokens={tokens} />
  }
  return (
    <View testID="progress-goals-section" style={styles.goalsSection}>
      {goals.length > 0 ? <Menu.Root open={filterOpen} onOpenChange={setFilterOpen}><ActionRow><Menu.Trigger asChild><PillButton variant="ghost" size="sm" minimumHeight={SMALL_PILL_VISIBLE_MIN} accessibleName={`${t('progressScreen.goals.filter')}: ${t(`progressScreen.goals.${filter}`)}`}>{t(`progressScreen.goals.${filter}`)}</PillButton></Menu.Trigger><IconButton label={t('goals.create')} onClick={onCreate}><Plus size={20} strokeWidth={1.5} accessible={false} /></IconButton></ActionRow>
        <Menu.Content title={t('progressScreen.goals.views')} shortTitle={t('progressScreen.goals.filter')} presentation="sheet"
          items={options.map((option) => ({ id: option.value, label: option.label, checked: option.value === filter }))}
          onSelect={(id) => { const option = options.find((item) => item.value === id); if (option) changeFilter(option.value) }} /></Menu.Root> : null}
      {goals.length === 0 ? <GoalsEmptyState onCreate={onCreate} tokens={tokens} inSection /> : null}
      {goals.length > 0 && filtered.length === 0 ? <View style={[styles.emptyLine, { backgroundColor: tokens.bgWell }]}><Text style={[styles.body, { color: tokens.fg2 }]}>{t('progressScreen.goals.filterEmpty')}</Text><PillButton variant="ghost" size="sm" minimumHeight={48} onClick={() => changeFilter('all')}>{t('progressScreen.goals.clearFilter')}</PillButton></View> : null}
      {filtered.length > 0 && filter === 'all' ? <NestableDraggableFlatList {...cellMotion} data={filtered} keyExtractor={(goal) => goal.id} renderItem={renderGoal} onDragEnd={handleDragEnd} activationDistance={5} ItemSeparatorComponent={GoalSeparator} /> : null}
      {filter !== 'all' ? filtered.map((goal) => <ContentFade key={goal.id}><GoalCard goal={goal} index={goals.findIndex((item) => item.id === goal.id)} total={goals.length} canReorder={false} isDragging={false} onMove={move} onOpen={() => onOpenGoal(goal.id)} onRegister={onRegisterGoal} tokens={tokens} /></ContentFade>) : null}
      {reorder.isError ? <Text accessibilityRole="alert" style={[styles.body, { color: tokens.fg2 }]}>{t('progressScreen.goals.reorderError')}</Text> : null}
    </View>
  )
}

function GoalSeparator() {
  return <View style={styles.goalSeparator} />
}

function ProgressPageHeading({ focusRef, title }: Readonly<{ focusRef: RefObject<Text | null>; title: string }>) {
  return <Text ref={focusRef} testID="progress-screen-heading" accessible style={styles.screenReaderTitle}>{title}</Text>
}

function ProgressGoalsContent() {
  const [goalFilter, setGoalFilter] = useAccountScopedState<ProgressGoalFilter>('all')
  const [creating, setCreating] = useAccountScopedState(false)
  const [createdGoalId, setCreatedGoalId] = useAccountScopedState<string | null>(null)
  const openCreateGoal = () => { setCreatedGoalId(null); setCreating(true) }
  const scrollRef = useRef<GestureScrollView>(null)
  const detailScrollRef = useRef<ScrollView>(null)
  const clearance = useShellPageEnd().paddingBottom
  const [detailGoalId, setDetailGoalId] = useState<string | null>(null)
  const openingGoalIdRef = useRef<string | null>(null)
  const goalCardRefs = useRef(new Map<string, View>())
  const pageHeadingRef = useRef<Text>(null)
  const { t } = useTranslation()

  const theme = useAppTheme()
  const tokens = useMemo(() => createTokensV2(theme.currentScheme, theme.currentTheme), [theme.currentScheme, theme.currentTheme])
  const goals = useGoals()
  const allGoals = goals.data?.allGoals ?? []
  const error = goals.isError
  const loading = !error && goals.isLoading
  const empty = !loading && !error && allGoals.length === 0
  const retry = () => { void goals.refetch() }
  const registerGoalCard = useCallback((goalId: string, instance: View | null) => {
    if (instance) goalCardRefs.current.set(goalId, instance)
    else goalCardRefs.current.delete(goalId)
  }, [])
  const openGoal = useCallback((goalId: string) => {
    openingGoalIdRef.current = goalId
    setDetailGoalId(goalId)
  }, [])
  useEffect(() => {
    const openingGoalId = openingGoalIdRef.current
    if (!detailGoalId && openingGoalId) {
      const destination = goalCardRefs.current.get(openingGoalId) ?? pageHeadingRef.current
      if (destination) AccessibilityInfo.sendAccessibilityEvent(destination, 'focus')
      openingGoalIdRef.current = null
    }
  }, [detailGoalId])
  useEffect(() => {
    if (creating || !createdGoalId) return
    const destination = goalCardRefs.current.get(createdGoalId) ?? pageHeadingRef.current
    if (destination) AccessibilityInfo.sendAccessibilityEvent(destination, 'focus')
  }, [creating, createdGoalId])
  return (
    <ProgressSubscreen screen="goals" hideHeader={detailGoalId !== null}>
      {creating ? <CreateGoalSheet open onCreated={(goalId) => { setGoalFilter('all'); setCreatedGoalId(goalId) }} onClose={() => setCreating(false)} /> : null}
      {detailGoalId ? <ScrollView ref={detailScrollRef} style={[styles.root, { backgroundColor: tokens.bg }]} contentContainerStyle={[styles.sections, { paddingBottom: clearance }]}><GoalDetailDrawer key={detailGoalId} inline open onClose={() => setDetailGoalId(null)} goalId={detailGoalId} /></ScrollView> : null}
    <NestableScrollContainer ref={scrollRef} testID="progress-goals-scroller" style={[styles.root, { backgroundColor: tokens.bg }, detailGoalId ? { display: 'none' } : undefined]} contentContainerStyle={[styles.content, styles.fill, { paddingBottom: clearance }]} showsVerticalScrollIndicator={false}>
      <View testID="progress-sections" style={[styles.sections, styles.fill]}>
        <ProgressPageHeading focusRef={pageHeadingRef} title={t('progressScreen.sections.goals')} />
        {loading ? <ProgressLoading label={t('progressScreen.loading')} screen="goals" /> : null}
        {error ? <View style={styles.error}><ErrorState message={t('progressScreen.error')} action={<IconButton label={t('progressScreen.retry')} onClick={retry}><RefreshCw size={20} strokeWidth={1.5} accessible={false} /></IconButton>} /></View> : null}
        {empty ? <ShellCentredRegion><GoalsEmptyState onCreate={openCreateGoal} tokens={tokens} /></ShellCentredRegion> : null}
        {!loading && !error && !empty ? <GoalsSection filter={goalFilter} setFilter={setGoalFilter} onCreate={openCreateGoal} onOpenGoal={openGoal} onRegisterGoal={registerGoalCard} goals={allGoals} tokens={tokens} /> : null}
      </View>
    </NestableScrollContainer>
    </ProgressSubscreen>
  )
}

const styles = StyleSheet.create({
  body: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
  content: { gap: PADDING.sectionStackGap },
  emptyLine: { alignItems: 'flex-start', borderRadius: 12, gap: 8, padding: PADDING.recordInset },
  error: { width: '100%' },
  fill: { flexGrow: 1 },
  goalCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: PADDING.recordInset, borderRadius: 20, overflow: 'hidden', borderWidth: 1 },
  goalCopy: { flex: 1, minWidth: 0, gap: 4 },
  goalMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  goalSeparator: { height: 12 },
  goalTitle: { fontFamily: 'Geist_500Medium', fontSize: 17, lineHeight: 24 },
  goalsSection: { gap: PADDING.sectionTitleGap },
  meta: { fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16 },
  root: { flex: 1 },
  screenReaderTitle: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', color: 'transparent' },
  sections: { gap: PADDING.sectionStackGap, paddingHorizontal: PADDING.screenGutter, paddingVertical: SPACING.s16 },
})

export function ProgressContent({ screen = 'overview' }: Readonly<{ screen?: ProgressSubmenuId | 'overview' }>) {
  if (screen === 'overview') return <ProgressOverviewRoute />
  if (screen === 'goals') return <ProgressGoalsContent />
  return <ProgressGamificationRoute screen={screen} />
}
