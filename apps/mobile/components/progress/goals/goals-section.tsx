import { useState } from 'react'
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { NestableDraggableFlatList, type DragEndParams, type RenderItemParams } from 'react-native-draggable-flatlist'
import type { Goal, GoalPositionItem } from '@orbit/shared/types/goal'
import { PADDING, SMALL_PILL_VISIBLE_MIN } from '@orbit/shared/theme'
import { buildGoalMovePositions, filterProgressGoals, type ProgressGoalFilter } from '@orbit/shared/utils'
import { ContentFade } from '@/components/motion/content-fade'
import { ActionRow } from '@/components/ui/action-row'
import * as Menu from '@/components/ui/dropdown-menu'
import { IconButton } from '@/components/ui/icon-button'
import { Plus } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'
import { useReorderGoals } from '@/hooks/use-goals'
import { createListCellMotion } from '@/lib/list-motion'
import { usePrefersReducedMotion } from '@/lib/motion'
import type { AppTokensV2 } from '@/lib/theme'
import { GoalCard } from './goal-card'

interface GoalsSectionProps {
  goals: readonly Goal[]
  tokens: AppTokensV2
  filter: ProgressGoalFilter
  setFilter: (filter: ProgressGoalFilter) => void
  onCreate: () => void
  onOpenGoal: (goalId: string) => void
  onRegisterGoal: (goalId: string, instance: View | null) => void
  /** The value each card's ring sweeps from once, or null for a card with no change since the last visit. */
  sweepFrom: (goal: Goal) => number | null
}

function GoalSeparator() {
  return <View style={styles.goalSeparator} />
}

function announceReorderResult(message: string) {
  AccessibilityInfo.announceForAccessibility(message)
}

export function GoalsSection({ goals, tokens, onOpenGoal, onRegisterGoal, onCreate, filter, setFilter, sweepFrom }: Readonly<GoalsSectionProps>) {
  const { t } = useTranslation()
  const reorder = useReorderGoals()
  const reducedListMotion = usePrefersReducedMotion()
  const [filterOpen, setFilterOpen] = useState(false)
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
    if (filter !== 'all' || reorder.isPending || from === to) return
    reorder.mutate(data.map((goal, position) => ({ id: goal.id, position })))
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
    return <GoalCard goal={item} index={index} total={goals.length} canReorder={filter === 'all' && !reorder.isPending} isDragging={isActive} sweepFrom={sweepFrom(item)} onDrag={drag} onMove={move} onOpen={() => onOpenGoal(item.id)} onRegister={onRegisterGoal} tokens={tokens} />
  }
  return (
    <View testID="progress-goals-section" style={styles.goalsSection}>
      <Menu.Root open={filterOpen} onOpenChange={setFilterOpen}><ActionRow><Menu.Trigger asChild><PillButton variant="ghost" size="sm" minimumHeight={SMALL_PILL_VISIBLE_MIN} accessibleName={`${t('progressScreen.goals.filter')}: ${t(`progressScreen.goals.${filter}`)}`}>{t(`progressScreen.goals.${filter}`)}</PillButton></Menu.Trigger><IconButton label={t('goals.create')} onClick={onCreate}><Plus size={20} strokeWidth={1.5} accessible={false} /></IconButton></ActionRow>
        <Menu.Content title={t('progressScreen.goals.views')} shortTitle={t('progressScreen.goals.filter')} presentation="sheet"
          items={options.map((option) => ({ id: option.value, label: option.label, checked: option.value === filter }))}
          onSelect={(id) => { const option = options.find((item) => item.value === id); if (option) setFilter(option.value) }} /></Menu.Root>
      {filtered.length === 0 ? <View style={[styles.emptyLine, { backgroundColor: tokens.bgWell }]}><Text style={[styles.body, { color: tokens.fg2 }]}>{t('progressScreen.goals.filterEmpty')}</Text><PillButton variant="ghost" size="sm" minimumHeight={48} onClick={() => setFilter('all')}>{t('progressScreen.goals.clearFilter')}</PillButton></View> : null}
      {filtered.length > 0 && filter === 'all' ? <NestableDraggableFlatList {...cellMotion} data={filtered} keyExtractor={(goal) => goal.id} renderItem={renderGoal} onDragEnd={handleDragEnd} activationDistance={5} ItemSeparatorComponent={GoalSeparator} /> : null}
      {filter !== 'all' ? filtered.map((goal) => <ContentFade key={goal.id}><GoalCard goal={goal} index={goals.findIndex((item) => item.id === goal.id)} total={goals.length} canReorder={false} isDragging={false} sweepFrom={sweepFrom(goal)} onMove={move} onOpen={() => onOpenGoal(goal.id)} onRegister={onRegisterGoal} tokens={tokens} /></ContentFade>) : null}
      {reorder.isError ? <Text accessibilityRole="alert" style={[styles.body, { color: tokens.fg2 }]}>{t('progressScreen.goals.reorderError')}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  goalsSection: { gap: PADDING.sectionTitleGap },
  goalSeparator: { height: 12 },
  emptyLine: { alignItems: 'flex-start', borderRadius: 12, gap: 8, padding: PADDING.recordInset },
  body: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
})
