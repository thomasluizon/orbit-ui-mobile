import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import type { Goal } from '@orbit/shared/types/goal'
import { getFriendlyErrorMessage, getProgressGoalLabelKey } from '@orbit/shared/utils'
import { plural } from '@/lib/plural'
import { Badge } from '@/components/ui/badge'
import { PillButton } from '@/components/ui/pill-button'
import { ProgressRing } from '@/components/ui/progress-ring'
import { StatusRing } from '@/components/ui/status-ring'
import { Minus, Plus } from '@/components/ui/icons'
import { useUpdateGoalProgress } from '@/hooks/use-goals'

function GoalDetailIndicator({ goal, label }: Readonly<{ goal: Goal; label: string }>) {
  if (goal.status === 'Abandoned') return null
  if (goal.status === 'Completed' || goal.progressPercentage >= 100) return <StatusRing status="done" size={60} label={label} />
  return <ProgressRing value={goal.progressPercentage} size={60} label={label} />
}

function GoalDerivedProgress({ goal }: Readonly<{ goal: Goal }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  if (goal.status === 'Abandoned' || !goal.isProgressDerived) return null
  const count = goal.linkedHabits.length
  const explanation = t(goal.type === 'Streak' ? 'goals.detail.derivedStreak' : 'goals.detail.derivedHabits', { count })
  return <Text style={[styles.body, { color: tokens.fg2 }]}>{plural(explanation, count)}</Text>
}

interface GoalProgressBlockProps {
  goal: Goal
  isUpdatingStatus: boolean
  onComplete: () => void
  refetchDetail: () => Promise<unknown>
}

export function GoalProgressBlock({ goal, isUpdatingStatus, onComplete, refetchDetail }: Readonly<GoalProgressBlockProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { width } = useWindowDimensions()
  const update = useUpdateGoalProgress()
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const abandoned = goal.status === 'Abandoned'
  const active = goal.status === 'Active'
  const derived = goal.isProgressDerived === true
  const done = goal.status === 'Completed' || goal.progressPercentage >= 100
  const labelKey = getProgressGoalLabelKey(goal)
  const ringLabel = t('goals.progressPercentage', { pct: Math.round(goal.progressPercentage) })

  async function step(change: number) {
    if (pending.current || !active || derived) return
    const value = Math.min(goal.targetValue, Math.max(0, goal.currentValue + change))
    if (value === goal.currentValue) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await update.mutateAsync({
        goalId: goal.id,
        data: { currentValue: value },
        goalName: goal.title,
        goalCount: goal.targetValue,
        goalUnit: goal.unit,
      })
      await refetchDetail()
    } catch (failure: unknown) {
      setError(getFriendlyErrorMessage(failure, t, 'goals.errors.progress', 'goalProgress'))
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={[styles.title, { fontSize: width >= 768 ? 28 : 22, color: abandoned ? tokens.fg3 : tokens.fg1 }]}>{goal.title}</Text>
          <View style={styles.meta}>
            {labelKey ? <Badge variant={abandoned ? 'outline' : 'solid'}>{t(labelKey)}</Badge> : null}
            {!abandoned ? <Text style={[styles.figure, { color: tokens.fg3 }]}>{t('progressScreen.goals.progress', { current: goal.currentValue, target: goal.targetValue, unit: goal.unit })}</Text> : null}
          </View>
        </View>
        <GoalDetailIndicator goal={goal} label={ringLabel} />
      </View>
      <GoalDerivedProgress goal={goal} />
      {active && !derived ? <View style={styles.manual} accessibilityState={{ busy }}>
        <Text style={[styles.body, { color: tokens.fg2 }]}>{t('goals.detail.manualProgress')}</Text>
        <View style={styles.stepper}>
        <PillButton variant="ghost" size="sm" iconOnly label={t('goals.detail.decrease')} disabled={busy || goal.currentValue <= 0} onClick={() => void step(-1)}><Minus size={16} color={tokens.fg1} /></PillButton>
        <Text style={[styles.value, { color: tokens.fg1 }]}>{goal.currentValue}</Text>
        <PillButton variant="ghost" size="sm" iconOnly label={t('goals.detail.increase')} disabled={busy || goal.currentValue >= goal.targetValue} onClick={() => void step(1)}><Plus size={16} color={tokens.fg1} /></PillButton>
        <Text style={[styles.body, { color: tokens.fg3 }]}>{goal.unit}</Text>
        </View>
      </View> : null}
      <Text accessibilityLiveRegion="polite" style={error ? [styles.body, { color: tokens.fg2 }] : styles.screenReader}>{error}</Text>
      {active && derived && done ? <View style={styles.completion}>
        <PillButton variant="secondary" size="sm" accessibleName={t('goals.detail.markCompleted')} disabled={busy || isUpdatingStatus} onClick={onComplete}>{t('goals.detail.markCompleted')}</PillButton>
        <Text style={[styles.body, { color: tokens.fg2 }]}>{t('goals.detail.completeWhyDerived')}</Text>
      </View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: 24 }, header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heading: { flex: 1, minWidth: 0, gap: 8 }, title: { fontFamily: 'SpaceGrotesk_500Medium' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  figure: { fontFamily: 'GeistMono_400Regular', fontSize: 12, fontVariant: ['tabular-nums'] },
  body: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
  value: { minWidth: 32, textAlign: 'center', fontFamily: 'GeistMono_400Regular', fontSize: 20, fontVariant: ['tabular-nums'] },
  manual: { gap: 8 },
  stepper: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  completion: { alignItems: 'flex-start', gap: 8 },
  screenReader: { position: 'absolute', width: 1, height: 1, overflow: 'hidden' },
})
