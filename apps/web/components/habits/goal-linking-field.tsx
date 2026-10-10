'use client'

import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import { PickerRow } from '@/components/ui/picker-row'
import { PickerList } from '@/components/ui/picker-list'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { goalKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { Goal } from '@orbit/shared/types/goal'
import { fetchJson } from '@/lib/api-fetch'
import { ListRow } from '@/components/ui/list-row'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { CreateGoalFromHabitSheet } from './create-goal-from-habit-sheet'

interface GoalLinkingFieldProps {
  selectedGoalIds: string[]
  atGoalLimit: boolean
  onToggleGoal: (goalId: string) => void
}

interface GoalsListResponse { items: Goal[] }

interface GoalPickerListProps {
  goals: Goal[]
  selectedIds: Set<string>
  atLimit: boolean
  onToggle: (goalId: string) => void
}

function GoalPickerRow({ goal, selected, disabled, onToggle }: Readonly<{
  goal: Goal
  selected: boolean
  disabled: boolean
  onToggle: (goalId: string) => void
}>) {
  return (
    <PickerRow
      name={goal.title}
      selected={selected}
      disabled={disabled}
      onToggle={() => onToggle(goal.id)}
      value={selected ? '✓' : `${Math.round(goal.progressPercentage)}%`}
      valueHidden={selected}
      valueClassName="font-mono text-xs text-[var(--fg-2)]"
      controlClassName="orbit-list-row-body flex min-h-12 w-full min-w-0 items-center rounded-[12px] px-2 py-1 text-left active:scale-[0.96] disabled:opacity-40"
      actionsClassName="flex items-center justify-between gap-2"
    />
  )
}

function GoalPickerList({ goals, selectedIds, atLimit, onToggle }: Readonly<GoalPickerListProps>) {
  const t = useTranslations()
  return <PickerList items={goals} getName={(goal) => goal.title} getKey={(goal) => goal.id} searchLabel={t('habits.form.searchGoals')} renderRow={(goal) => {
    const selected = selectedIds.has(goal.id)
    return <GoalPickerRow goal={goal} selected={selected} disabled={!selected && atLimit} onToggle={onToggle} />
  }} />
}

export function GoalLinkingField({ selectedGoalIds, atGoalLimit, onToggleGoal }: Readonly<GoalLinkingFieldProps>) {
  const t = useTranslations()
  const [open, setOpen] = useAccountScopedState(false)
  const [creating, setCreating] = useAccountScopedState(false)
  const { sheetRef, closeSheet } = useSheetHost()
  const { data: goals } = useQuery({
    queryKey: goalKeys.lists(),
    queryFn: async (): Promise<Goal[]> => {
      const response = await fetchJson<GoalsListResponse | Goal[]>(API.goals.list)
      return Array.isArray(response) ? response : response.items
    },
    staleTime: QUERY_STALE_TIMES.goals,
  })
  const activeGoals = useMemo(() => goals?.filter((goal) => goal.status === 'Active') ?? [], [goals])
  const selectedSet = useMemo(() => new Set(selectedGoalIds), [selectedGoalIds])
  const selectedGoals = activeGoals.filter((goal) => selectedSet.has(goal.id))
  const openCreateGoal = () => closeSheet(() => {
    setOpen(false)
    setCreating(true)
  })

  return (
    <>
      <ListRow title={t('habits.form.goals')} value={t('habits.form.selectedCount', { count: selectedGoalIds.length })} placement="column" onClick={() => setOpen(true)} />
      {selectedGoals.length > 0 ? (
        <div className="flex flex-wrap gap-2 pt-2">
          {selectedGoals.slice(0, 3).map((goal) => <div key={goal.id} className="min-w-0 max-w-full rounded-[8px] bg-[var(--bg-well)] text-sm font-medium text-[var(--fg-2)]"><PersonalTextDetails lines={1}>{goal.title}</PersonalTextDetails></div>)}
          {selectedGoals.length > 3 ? <span className="chip">{t('habits.form.moreSelected', { count: selectedGoals.length - 3 })}</span> : null}
        </div>
      ) : null}
      {open ? (
        <Sheet ref={sheetRef} open virtualizedBody={activeGoals.length >= 21} title={t('habits.form.goals')} onClose={() => setOpen(false)}>
          {activeGoals.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-8 text-center" style={{ gap: 12 }}>
              <p className="max-w-full truncate text-xl font-medium text-[var(--fg-1)]">{t('habits.form.noGoals')}</p>
              <button type="button" className="chip mt-2" onClick={openCreateGoal}>{t('habits.form.createGoal')}</button>
            </div>
          ) : (
            <GoalPickerList goals={activeGoals} selectedIds={selectedSet} atLimit={atGoalLimit} onToggle={onToggleGoal} />
          )}
        </Sheet>
      ) : null}
      <CreateGoalFromHabitSheet open={creating} onClose={() => setCreating(false)} />
    </>
  )
}
