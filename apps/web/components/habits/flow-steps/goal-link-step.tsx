'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
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

function quickGoals(goals: Goal[], selected: Set<string>): Goal[] {
  return [...goals.filter((goal) => selected.has(goal.id)), ...goals.filter((goal) => !selected.has(goal.id))].slice(0, QUICK_GOALS)
}

function GoalSearch({ goals, selected, atGoalLimit, onToggleGoal }: Readonly<{ goals: Goal[]; selected: Set<string>; atGoalLimit: boolean; onToggleGoal: (goalId: string) => void }>) {
  const t = useTranslations()
  const [query, setQuery] = useState('')
  const term = query.trim().toLocaleLowerCase()
  const matches = term ? goals.filter((goal) => goal.title.toLocaleLowerCase().includes(term)) : []
  return <>
    <Input kind="search" label={t('habits.form.searchGoals')} name="goalSearch" value={query} onChange={setQuery} />
    {term && matches.length === 0 ? <p role="status" className="text-center text-sm text-[var(--fg-3)]">{t('habits.flow.goals.searchMiss')}</p> : null}
    {matches.map((goal) => {
      const isSelected = selected.has(goal.id)
      return <PickerRow key={goal.id} name={goal.title} selected={isSelected} disabled={!isSelected && atGoalLimit} onToggle={() => onToggleGoal(goal.id)}
        value={isSelected ? '✓' : `${Math.round(goal.progressPercentage)}%`} valueHidden={isSelected} valueClassName="font-mono text-xs text-[var(--fg-2)]"
        controlClassName="orbit-list-row-body flex min-h-12 w-full min-w-0 items-center rounded-[12px] px-2 py-1 text-left disabled:opacity-40"
        actionsClassName="flex items-center justify-between gap-2" />
    })}
  </>
}

/** The goal step "Isso ajuda em alguma meta?": a multi-select over the active goals, with `Criar meta` opening the goal create flow. */
export function useGoalLinkStepView(props: Readonly<GoalLinkStepProps>): FlowStepView {
  const { habitTitle, atGoalLimit, onToggleGoal, onContinue } = props
  const t = useTranslations()
  const goalsQuery = useLinkableGoals()
  const goals = goalsQuery.data
  const linking = useGoalLinking({ ...props, onGoalCreated: props.onGoalCreated ?? onToggleGoal }, goals, (afterDismiss) => afterDismiss())
  const limitReason = t('habits.flow.goals.limit')
  const { activeGoals, selectedSet } = linking
  return {
    question: t('habits.flow.optional.goals'),
    line: !goalsQuery.isSuccess || activeGoals.length > 0 ? t('habits.flow.goals.line') : t('habits.flow.goals.lineEmpty'),
    options: <>
      {quickGoals(activeGoals, selectedSet).map((goal) => {
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
