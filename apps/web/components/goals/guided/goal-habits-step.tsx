'use client'

import { Suspense, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { FlowStepView } from '@orbit/shared/contracts/flow'
import type { GoalType } from '@orbit/shared/types/goal'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { MAX_HABITS_PER_GOAL } from '@orbit/shared/validation'
import { joinNamedItems, toggleSelectedId } from '@orbit/shared/utils'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { IconButton } from '@/components/ui/icon-button'
import { Plus } from '@/components/ui/icons'
import { InlineLoadError } from '@/components/ui/inline-load-error'
import { Input } from '@/components/ui/input'
import { OptionCard } from '@/components/ui/option-card'
import { PickerRow } from '@/components/ui/picker-row'
import { Skeleton } from '@/components/ui/skeleton'
import { useHabits } from '@/hooks/use-habit-queries'
import { goalHabitPicker } from '../goal-habits-field'
import { GoalHabitsSelectionNote } from '../goal-habits-selection-note'

const QUICK_OPTIONS = 4
const { CreateHabitModal, useGoalHabitCreation } = goalHabitPicker

interface GoalHabitsStepInput {
  selectedIds: string[]
  goalType: GoalType
  onChange: (ids: string[]) => void
  onContinue: () => void
}

/** The habits selected when the step opened lead, then the order of the list. The order stays while the person presses. */
function quickHabits(items: NormalizedHabit[], leading: ReadonlySet<string>): NormalizedHabit[] {
  return [...items.filter((habit) => leading.has(habit.id)), ...items.filter((habit) => !leading.has(habit.id))].slice(0, QUICK_OPTIONS)
}

function HabitSearch({ items, selectedIds, atLimit, onToggle }: Readonly<{ items: NormalizedHabit[]; selectedIds: string[]; atLimit: boolean; onToggle: (id: string) => void }>) {
  const t = useTranslations()
  const [query, setQuery] = useState('')
  const needle = query.trim().toLocaleLowerCase()
  const matches = needle ? items.filter((habit) => habit.title.toLocaleLowerCase().includes(needle)) : []
  return <>
    <Input label={t('goals.form.searchHabits')} kind="search" name="goal-habit-search" value={query} onChange={setQuery} />
    {needle && matches.length === 0 ? <p role="status" className="text-center text-sm text-[var(--fg-2)]">{t('habits.moveParent.noSearchResults')}</p> : null}
    {matches.map((habit) => {
      const selected = selectedIds.includes(habit.id)
      return <PickerRow key={habit.id} name={habit.title} selected={selected} disabled={!selected && atLimit} onToggle={() => onToggle(habit.id)} value={selected ? '✓' : ''} valueHidden valueClassName="flex-1 text-sm text-[var(--fg-2)]" controlClassName="orbit-list-row-body flex min-h-12 w-full items-center rounded-[12px] px-2 py-1 text-left disabled:opacity-40" actionsClassName="flex items-center justify-between gap-2" />
    })}
  </>
}

/** "Which habits": the person's habits as quick options, a search over every habit, and a habit created from here, as the sheet does today. */
export function useGoalHabitsView({ selectedIds, goalType, onChange, onContinue }: GoalHabitsStepInput): FlowStepView {
  const t = useTranslations()
  const [leading] = useState(() => new Set(selectedIds))
  const { creatingHabit, setCreatingHabit, habitFormState, openHabitForm, habits, items } = useGoalHabitCreation((afterDismiss) => afterDismiss())
  const atLimit = selectedIds.length >= MAX_HABITS_PER_GOAL
  const toggle = (id: string) => onChange(toggleSelectedId(selectedIds, id))
  const create = <IconButton label={t('habits.createHabit')} disabled={habitFormState === 'loading'} loading={habitFormState === 'loading'} onClick={() => void openHabitForm()}><Plus size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
  const loaded = !habits.isLoading && !habits.isError
  return {
    question: t('goals.flow.habits.question'),
    line: loaded && items.length === 0 ? t('goals.form.habitsInvitation') : t('goals.form.habitsExplainer'),
    options: loaded && items.length > 0 ? <>
      {quickHabits(items, leading).map((habit) => {
        const selected = selectedIds.includes(habit.id)
        return <OptionCard key={habit.id} label={habit.title} selected={selected} disabled={!selected && atLimit} disabledReason={t('goals.form.habitLimit')} onSelect={() => toggle(habit.id)} />
      })}
    </> : undefined,
    free: <>
      {habits.isLoading ? <Skeleton variant="settings" rows={3} label={t('common.loading')} /> : null}
      {habits.isError ? <InlineLoadError message={t('goals.form.habitsError')} onRetry={() => void habits.refetch()} /> : null}
      {loaded && items.length === 0 ? <div className="flex justify-center">{create}</div> : null}
      {loaded && items.length > QUICK_OPTIONS ? <HabitSearch items={items} selectedIds={selectedIds} atLimit={atLimit} onToggle={toggle} /> : null}
      {habitFormState === 'error' ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{t('goals.form.habitFormError')}</p> : null}
      <GoalHabitsSelectionNote selectedIds={selectedIds} goalType={goalType} />
      {atLimit ? <CapacityNotice message={t('goals.detail.linkedLimit', { count: MAX_HABITS_PER_GOAL })} /> : null}
      {creatingHabit ? <Suspense fallback={null}><CreateHabitModal open onOpenChange={(open: boolean) => { if (!open) setCreatingHabit(false) }} /></Suspense> : null}
    </>,
    primary: { label: t('habits.flow.continue'), onPress: onContinue },
  }
}

/** The linked habits as the summary row shows them: the habit the goal starts from, or the names of the selected habits. */
export function useGoalHabitsSummary(selectedIds: string[], fromHabit: { title: string } | undefined): string {
  const t = useTranslations()
  const locale = useLocale()
  const habits = useHabits({})
  if (fromHabit) return fromHabit.title
  const names = selectedIds.map((id) => habits.data?.habitsById.get(id)?.title).filter((title): title is string => Boolean(title))
  if (names.length === 0) return t('goals.noLinkedHabits')
  return joinNamedItems(names, locale, (count) => t('habits.flow.tags.more', { count }))
}
