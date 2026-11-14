import { useMemo, useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { FlowStepView } from '@orbit/shared/contracts/flow'
import type { Goal } from '@orbit/shared/types/goal'
import { createUseGoalLinking } from '@orbit/shared/hooks'
import { CreateGoalSheet } from '@/components/goals/create-goal-sheet'
import { useLinkableGoals } from '@/components/habits/goal-linking-field'
import { Input } from '@/components/ui/input'
import { InlineLoadError } from '@/components/ui/inline-load-error'
import { OptionCard } from '@/components/ui/option-card'
import { Skeleton } from '@/components/ui/skeleton'
import { PickerRow } from '@/components/ui/picker-row'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useThemeTokens } from '@/hooks/use-theme-tokens'

const useGoalLinking = createUseGoalLinking(useAccountScopedState)

/** The quick options show this many goals, the selected ones first. More goals than this put every goal behind the search. */
const QUICK_GOALS = 4

export interface GoalLinkStepProps {
  /** Absent while the habit is not saved yet. */
  habitId?: string
  /** The title the person gave the habit: the goal create flow shows it on its summary. */
  habitTitle: string
  selectedGoalIds: string[]
  atGoalLimit: boolean
  onToggleGoal: (goalId: string) => void
  /** Selects a goal created from this step. Defaults to `onToggleGoal`. */
  onGoalCreated?: (goalId: string) => void
  onContinue: () => void
}

/** The goals selected when the step opened lead, then the list order. The order stays while the person presses. */
function quickGoals(goals: Goal[], leading: ReadonlySet<string>): Goal[] {
  return [...goals.filter((goal) => leading.has(goal.id)), ...goals.filter((goal) => !leading.has(goal.id))].slice(0, QUICK_GOALS)
}

function GoalSearch({ goals, selected, atGoalLimit, onToggleGoal }: Readonly<{ goals: Goal[]; selected: Set<string>; atGoalLimit: boolean; onToggleGoal: (goalId: string) => void }>) {
  const { t } = useTranslation()
  const tokens = useThemeTokens()
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const [query, setQuery] = useState('')
  const term = query.trim().toLocaleLowerCase()
  const matches = term ? goals.filter((goal) => goal.title.toLocaleLowerCase().includes(term)) : []
  return <>
    <Input kind="search" label={t('habits.form.searchGoals')} value={query} onChange={setQuery} />
    {term && matches.length === 0 ? <Text accessibilityLiveRegion="polite" style={styles.miss}>{t('habits.flow.goals.searchMiss')}</Text> : null}
    {matches.map((goal) => {
      const isSelected = selected.has(goal.id)
      return <PickerRow key={goal.id} name={goal.title} selected={isSelected} disabled={!isSelected && atGoalLimit} onToggle={() => onToggleGoal(goal.id)}
        value={isSelected ? '✓' : `${Math.round(goal.progressPercentage)}%`} valueHidden={isSelected} valueStyle={styles.value} />
    })}
  </>
}

/** The goal step "Isso ajuda em alguma meta?": a multi-select over the active goals, with `Criar meta` opening the goal create flow. */
export function useGoalLinkStepView(props: Readonly<GoalLinkStepProps>): FlowStepView {
  const { habitTitle, atGoalLimit, onToggleGoal, onContinue } = props
  const { t } = useTranslation()
  const goalsQuery = useLinkableGoals()
  const [leading] = useState(() => new Set(props.selectedGoalIds))
  const goals = goalsQuery.data
  const linking = useGoalLinking({ ...props, onGoalCreated: props.onGoalCreated ?? onToggleGoal }, goals, (afterDismiss) => afterDismiss())
  const limitReason = t('habits.flow.goals.limit')
  const { activeGoals, selectedSet } = linking
  return {
    question: t('habits.flow.optional.goals'),
    line: !goalsQuery.isSuccess || activeGoals.length > 0 ? t('habits.flow.goals.line') : t('habits.flow.goals.lineEmpty'),
    options: <>
      {quickGoals(activeGoals, leading).map((goal) => {
        const selected = selectedSet.has(goal.id)
        return <OptionCard key={goal.id} label={t('habits.flow.goals.option', { title: goal.title, percent: Math.round(goal.progressPercentage) })} selected={selected} disabled={!selected && atGoalLimit} disabledReason={limitReason} onSelect={() => onToggleGoal(goal.id)} />
      })}
      <OptionCard label={t('habits.form.createGoal')} disabled={atGoalLimit} disabledReason={limitReason} onSelect={linking.openCreateGoal} />
    </>,
    free: <>
      {goalsQuery.isLoading ? <Skeleton variant="settings" rows={2} label={t('common.loading')} /> : null}
      {goalsQuery.isError ? <InlineLoadError message={t('habits.flow.goals.loadError')} onRetry={() => void goalsQuery.refetch()} /> : null}
      {activeGoals.length > QUICK_GOALS ? <GoalSearch goals={activeGoals} selected={selectedSet} atGoalLimit={atGoalLimit} onToggleGoal={onToggleGoal} /> : null}
      {linking.creating ? <CreateGoalSheet open initialHabitIds={linking.initialHabitIds} fromHabit={{ title: habitTitle }} onCreated={linking.handleCreated} onClose={() => linking.setCreating(false)} /> : null}
    </>,
    primary: { label: t('habits.flow.continue'), onPress: onContinue },
  }
}

function createStyles(tokens: ReturnType<typeof useThemeTokens>) {
  return StyleSheet.create({
    miss: { color: tokens.fg3, fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20, textAlign: 'center' },
    value: { flex: 1, color: tokens.fg2, fontFamily: 'GeistMono_400Regular', fontSize: 12 },
  })
}
