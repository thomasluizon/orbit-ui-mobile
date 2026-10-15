'use client'

import { useTranslations } from 'next-intl'
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

interface GoalHabitsFieldProps {
  selectedIds: string[]
  onChange: (ids: string[]) => void
  disabled: boolean
}

export function GoalHabitsPicker({ selectedIds, onChange, disabled, onClose }: Readonly<GoalHabitsFieldProps & { onClose: () => void }>) {
  const t = useTranslations()
  const { sheetRef, closeSheet } = useSheetHost()
  const habits = useHabits({})
  const items = Array.from(habits.data?.habitsById.values() ?? [])
  const atLimit = selectedIds.length >= MAX_HABITS_PER_GOAL
  return <Sheet ref={sheetRef} open actions={<PillButton onClick={() => closeSheet()}>{t('common.done')}</PillButton>} title={t('goals.linkedHabits')} onClose={onClose} virtualizedBody={items.length >= 21}>
    {habits.isLoading ? <Skeleton variant="settings" rows={3} label={t('common.loading')} /> : habits.isError ? <div role="alert"><p>{t('goals.form.habitsError')}</p><PillButton variant="ghost" onClick={() => void habits.refetch()}>{t('common.retry')}</PillButton></div> : <PickerList inset={false} items={items} getKey={(habit) => habit.id} getName={(habit) => habit.title} searchLabel={t('goals.form.searchHabits')} empty={<EmptyState title={t('habits.emptyState')} />} emptySearch={<EmptyState title={t('habits.moveParent.noSearchResults')} action={<PillButton variant="ghost" onClick={() => closeSheet()}>{t('common.close')}</PillButton>} />} renderRow={(habit) => {
      const selected = selectedIds.includes(habit.id)
      return <PickerRow name={habit.title} selected={selected} disabled={disabled || (!selected && atLimit)} onToggle={() => onChange(toggleSelectedId(selectedIds, habit.id))} value={selected ? '✓' : ''} valueHidden valueClassName="flex-1 text-sm text-[var(--fg-2)]" controlClassName="orbit-list-row-body flex min-h-12 w-full items-center rounded-[12px] px-2 py-1 text-left disabled:opacity-40" actionsClassName="flex items-center justify-between gap-2" />
    }} />}
    {atLimit ? <CapacityNotice message={t('goals.detail.linkedLimit', { count: MAX_HABITS_PER_GOAL })} /> : null}
  </Sheet>
}
