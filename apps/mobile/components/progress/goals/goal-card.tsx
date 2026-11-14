import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { Goal } from '@orbit/shared/types/goal'
import { PADDING } from '@orbit/shared/theme'
import { getProgressGoalLabelKey } from '@orbit/shared/utils'
import { useRingSweep } from '@/components/goals/goal-detail-drawer/use-ring-sweep'
import { PressScale } from '@/components/motion/press-scale'
import { Badge } from '@/components/ui/badge'
import { PersonalText } from '@/components/ui/personal-text'
import { ProgressRing } from '@/components/ui/progress-ring'
import { StatusRing } from '@/components/ui/status-ring'
import { shadowsV2, type AppTokensV2 } from '@/lib/theme'
import { useGoalDrag } from '../use-goal-drag'

function GoalIndicator({ goal, sweepFrom }: Readonly<{ goal: Goal; sweepFrom: number | null }>) {
  const { t } = useTranslation()
  const shown = useRingSweep(goal.progressPercentage, sweepFrom)
  if (goal.status === 'Abandoned') return null
  const label = t('goals.progressPercentage', { pct: Math.round(goal.progressPercentage) })
  if (goal.status === 'Completed' || goal.progressPercentage >= 100) return <StatusRing status="done" size={30} label={label} />
  return <View testID={`goal-ring-${goal.id}`} data-ring-sweep={shown === goal.progressPercentage ? 'rest' : 'sweeping'}><ProgressRing value={shown} size={44} label={label} /></View>
}

/** The painted goal card surface: the hover fill while pressed and the granted lifted state while dragged. */
function goalCardSurfaceStyle(pressed: boolean, isDragging: boolean, tokens: AppTokensV2) {
  return [
    styles.goalCard,
    { backgroundColor: pressed ? tokens.bgHover : tokens.bgCard, borderColor: tokens.hairlineGhost },
    isDragging ? { ...shadowsV2.shadow2, borderColor: tokens.hairlineStrong, opacity: 0.5 } : null,
  ]
}

type GoalTranslate = ReturnType<typeof useTranslation>['t']

/** The goal card's spoken name: title, state, progress unless the goal is abandoned, and list position. */
function goalAccessibilityLabel(goal: Goal, labelKey: ReturnType<typeof getProgressGoalLabelKey>, position: string, t: GoalTranslate) {
  const state = t(labelKey ?? 'goals.status.active')
  if (goal.status === 'Abandoned') return t('progressScreen.goals.accessibleLabelWithoutProgress', { title: goal.title, state, position })
  return t('progressScreen.goals.accessibleLabel', {
    title: goal.title,
    state,
    progress: t('progressScreen.goals.progress', { current: goal.currentValue, target: goal.targetValue, unit: goal.unit }),
    position,
  })
}

/** Moves the goal one place up or down from the screen reader's adjustable actions. */
function moveGoalByAccessibilityAction(actionName: string, goalId: string, index: number, onMove: (goalId: string, target: number) => void) {
  if (actionName === 'decrement') onMove(goalId, index - 1)
  if (actionName === 'increment') onMove(goalId, index + 1)
}

interface GoalCardProps {
  goal: Goal
  index: number
  total: number
  canReorder: boolean
  isDragging: boolean
  /** The value the ring sweeps from once, when the goal changed since the last visit. Null draws the ring at rest. */
  sweepFrom: number | null
  onDrag?: () => void
  onMove: (goalId: string, target: number) => void
  onOpen: () => void
  onRegister: (goalId: string, instance: View | null) => void
  tokens: AppTokensV2
}

export function GoalCard({ goal, index, total, canReorder, isDragging, sweepFrom, onDrag, onMove, onOpen, onRegister, tokens }: Readonly<GoalCardProps>) {
  const { t } = useTranslation()
  const { suppressPress, ...gesture } = useGoalDrag(canReorder ? onDrag : undefined)
  const focusRef = useRef<View>(null)
  const [pressed, setPressed] = useState(false)
  useEffect(() => {
    onRegister(goal.id, focusRef.current)
    return () => onRegister(goal.id, null)
  }, [goal.id, onRegister])
  const labelKey = getProgressGoalLabelKey(goal)
  const abandoned = goal.status === 'Abandoned'
  const accessibilityLabel = goalAccessibilityLabel(goal, labelKey, t('progressScreen.goals.position', { position: index + 1, total }), t)
  // WHY: the card presses its surface inside a target that keeps its full size, as the web card does, so the pressed surface never moves its own target. The press state lives here, not in a Pressable render function, so the surface stays plain children of its labelled control. https://github.com/thomasluizon/orbit-tickets/issues/2096
  return (
    <Pressable ref={focusRef} testID={`goal-card-${goal.id}`} accessible accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      accessibilityHint={canReorder ? t('progressScreen.goals.reorderHint') : undefined}
      accessibilityActions={canReorder ? [{ name: 'decrement', label: t('progressScreen.goals.moveUp') }, { name: 'increment', label: t('progressScreen.goals.moveDown') }] : undefined}
      onAccessibilityAction={canReorder ? (event) => moveGoalByAccessibilityAction(event.nativeEvent.actionName, goal.id, index, onMove) : undefined}
      {...gesture} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} onPress={() => { if (!suppressPress()) onOpen() }}
      style={isDragging ? styles.goalCardLifted : null}>
      <PressScale pressed={pressed || isDragging} disabled={false} style={goalCardSurfaceStyle(pressed, isDragging, tokens)}>
        <View style={styles.goalCopy}>
          <PersonalText ellipsizeMode="tail" style={[styles.goalTitle, { color: abandoned ? tokens.fg2 : tokens.fg1 }]}>{goal.title}</PersonalText>
          <View style={styles.goalMeta}>
            {labelKey ? <Badge variant={abandoned ? 'outline' : 'solid'}>{t(labelKey)}</Badge> : null}
            {!abandoned ? <Text style={[styles.meta, { color: tokens.fg2 }]}>{t('progressScreen.goals.progress', { current: goal.currentValue, target: goal.targetValue, unit: goal.unit })}</Text> : null}
          </View>
        </View>
        <GoalIndicator goal={goal} sweepFrom={sweepFrom} />
      </PressScale>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  goalCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: PADDING.recordInset, borderRadius: 20, overflow: 'hidden', borderWidth: 1 },
  goalCardLifted: { zIndex: 2 },
  goalTitle: { fontFamily: 'Geist_500Medium', fontSize: 17, lineHeight: 24 },
  goalMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  goalCopy: { flex: 1, minWidth: 0, gap: 4 },
  meta: { fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16 },
})
