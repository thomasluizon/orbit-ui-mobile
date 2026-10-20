'use client'

import { lazy, Suspense } from 'react'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { Plus } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { GoalHabitsSelectionNote } from './goal-habits-selection-note'
import { createGoalHabitPicker, type GoalHabitsPickerProps } from '@orbit/shared/hooks'
import { MAX_HABITS_PER_GOAL } from '@orbit/shared/validation'
import { toggleSelectedId } from '@orbit/shared/utils'
import { useHabits } from '@/hooks/use-habit-queries'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { PickerList } from '@/components/ui/picker-list'
import { PickerRow } from '@/components/ui/picker-row'
import { PillButton } from '@/components/ui/pill-button'
import { CapacityNotice } from '@/components/ui/capacity-notice'

const { CreateHabitModal, useGoalHabitCreation } = createGoalHabitPicker({
  useState: useAccountScopedState, getAccountGeneration, useHabits: () => useHabits({}),
  loadModule: () => import('@/components/habits/create-habit-modal'), lazy,
})

export function GoalHabitsPicker({ selectedIds, goalType, onChange, disabled, onClose }: Readonly<GoalHabitsPickerProps>) {
  const t = useTranslations()
  const { sheetRef, closeSheet } = useSheetHost()
  const { creatingHabit, setCreatingHabit, habitFormState, openHabitForm, habits, items } = useGoalHabitCreation(closeSheet)
  const atLimit = selectedIds.length >= MAX_HABITS_PER_GOAL
  if (creatingHabit) return <Suspense fallback={null}><CreateHabitModal open onOpenChange={(open) => { if (!open) setCreatingHabit(false) }} /></Suspense>
  return <Sheet ref={sheetRef} open actions={<PillButton onClick={() => closeSheet()}>{t('common.done')}</PillButton>} title={t('goals.linkedHabits')} onClose={onClose} virtualizedBody={items.length >= 21}>
    {habits.isLoading ? <Skeleton variant="settings" rows={3} label={t('common.loading')} /> : habits.isError ? <div role="alert"><p>{t('goals.form.habitsError')}</p><PillButton variant="ghost" onClick={() => void habits.refetch()}>{t('common.retry')}</PillButton></div> : <PickerList inset={false} items={items} getKey={(habit) => habit.id} getName={(habit) => habit.title} searchLabel={t('goals.form.searchHabits')} empty={<EmptyState title={t('goals.form.habitsInvitation')} action={<PillButton leadingIcon={<Plus size={16} strokeWidth={2} aria-hidden="true" />} disabled={disabled || habitFormState === 'loading'} loading={habitFormState === 'loading'} onClick={() => void openHabitForm()}>{t('habits.createHabit')}</PillButton>} />} emptySearch={<EmptyState title={t('habits.moveParent.noSearchResults')} action={<PillButton variant="ghost" onClick={() => closeSheet()}>{t('common.close')}</PillButton>} />} renderRow={(habit) => {
      const selected = selectedIds.includes(habit.id)
      return <PickerRow name={habit.title} selected={selected} disabled={disabled || (!selected && atLimit)} onToggle={() => onChange(toggleSelectedId(selectedIds, habit.id))} value={selected ? '✓' : ''} valueHidden valueClassName="flex-1 text-sm text-[var(--fg-2)]" controlClassName="orbit-list-row-body flex min-h-12 w-full items-center rounded-[12px] px-2 py-1 text-left disabled:opacity-40" actionsClassName="flex items-center justify-between gap-2" />
    }} />}
    {habitFormState === 'error' ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{t('goals.form.habitFormError')}</p> : null}
    <GoalHabitsSelectionNote selectedIds={selectedIds} goalType={goalType} />
    {atLimit ? <CapacityNotice message={t('goals.detail.linkedLimit', { count: MAX_HABITS_PER_GOAL })} /> : null}
  </Sheet>
}
