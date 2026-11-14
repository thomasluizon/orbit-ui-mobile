import { Suspense, useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { FlowStepView } from '@orbit/shared/contracts/flow'
import type { GoalType } from '@orbit/shared/types/goal'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { MAX_HABITS_PER_GOAL } from '@orbit/shared/validation'
import { toggleSelectedId } from '@orbit/shared/utils'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { EmptyState } from '@/components/ui/empty-state'
import { IconButton } from '@/components/ui/icon-button'
import { Plus } from '@/components/ui/icons'
import { InlineLoadError } from '@/components/ui/inline-load-error'
import { Input } from '@/components/ui/input'
import { OptionCard } from '@/components/ui/option-card'
import { PickerRow } from '@/components/ui/picker-row'
import { Skeleton } from '@/components/ui/skeleton'
import { useHabits } from '@/hooks/use-habit-queries'
import { useThemeTokens } from '@/hooks/use-theme-tokens'
import { goalHabitPicker } from '../goal-habits-field'
import { GoalHabitsSelectionNote } from '../goal-habits-selection-note'
import { joinNames } from './goal-flow-steps'

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
  const { t } = useTranslation()
  const tokens = useThemeTokens()
  const [query, setQuery] = useState('')
  const needle = query.trim().toLocaleLowerCase()
  const matches = needle ? items.filter((habit) => habit.title.toLocaleLowerCase().includes(needle)) : []
  return <>
    <Input label={t('goals.form.searchHabits')} kind="search" value={query} onChange={setQuery} />
    {needle && matches.length === 0 ? <Text style={[styles.note, { color: tokens.fg2 }]}>{t('habits.moveParent.noSearchResults')}</Text> : null}
    {matches.map((habit) => {
      const selected = selectedIds.includes(habit.id)
      return <PickerRow key={habit.id} name={habit.title} selected={selected} disabled={!selected && atLimit} onToggle={() => onToggle(habit.id)} value={selected ? '✓' : ''} valueHidden valueStyle={{ flex: 1, color: tokens.fg2 }} />
    })}
  </>
}

/** "Which habits": the person's habits as quick options, a search over every habit, and a habit created from here, as the sheet does today. */
export function useGoalHabitsView({ selectedIds, goalType, onChange, onContinue }: GoalHabitsStepInput): FlowStepView {
  const { t } = useTranslation()
  const tokens = useThemeTokens()
  const [leading] = useState(() => new Set(selectedIds))
  const { creatingHabit, setCreatingHabit, habitFormState, openHabitForm, habits, items } = useGoalHabitCreation((afterDismiss) => afterDismiss())
  const atLimit = selectedIds.length >= MAX_HABITS_PER_GOAL
  const toggle = (id: string) => onChange(toggleSelectedId(selectedIds, id))
  const create = <IconButton label={t('habits.createHabit')} disabled={habitFormState === 'loading'} loading={habitFormState === 'loading'} onClick={() => void openHabitForm()}><Plus size={20} strokeWidth={1.5} accessible={false} /></IconButton>
  const loaded = !habits.isLoading && !habits.isError
  return {
    question: t('goals.flow.habits.question'),
    line: t('goals.form.habitsExplainer'),
    options: loaded && items.length > 0 ? <>
      {quickHabits(items, leading).map((habit) => {
        const selected = selectedIds.includes(habit.id)
        return <OptionCard key={habit.id} label={habit.title} selected={selected} disabled={!selected && atLimit} disabledReason={t('goals.form.habitLimit')} onSelect={() => toggle(habit.id)} />
      })}
    </> : undefined,
    free: <>
      {habits.isLoading ? <Skeleton variant="settings" rows={3} label={t('common.loading')} /> : null}
      {habits.isError ? <InlineLoadError message={t('goals.form.habitsError')} onRetry={() => void habits.refetch()} /> : null}
      {loaded && items.length === 0 ? <EmptyState title={t('goals.form.habitsInvitation')} action={create} /> : null}
      {loaded && items.length > QUICK_OPTIONS ? <HabitSearch items={items} selectedIds={selectedIds} atLimit={atLimit} onToggle={toggle} /> : null}
      {habitFormState === 'error' ? <Text accessibilityRole="alert" style={[styles.note, { color: tokens.statusBadText }]}>{t('goals.form.habitFormError')}</Text> : null}
      <GoalHabitsSelectionNote selectedIds={selectedIds} goalType={goalType} />
      {atLimit ? <CapacityNotice message={t('goals.detail.linkedLimit', { count: MAX_HABITS_PER_GOAL })} /> : null}
      {creatingHabit ? <Suspense fallback={null}><CreateHabitModal open onClose={() => setCreatingHabit(false)} /></Suspense> : null}
    </>,
    primary: { label: t('habits.flow.continue'), onPress: onContinue },
  }
}

/** The linked habits as the summary row shows them: the habit the goal starts from, or the names of the selected habits. */
export function useGoalHabitsSummary(selectedIds: string[], fromHabit: { title: string } | undefined): string {
  const { t, i18n } = useTranslation()
  const habits = useHabits({})
  if (fromHabit) return fromHabit.title
  const names = selectedIds.map((id) => habits.data?.habitsById.get(id)?.title).filter((title): title is string => Boolean(title))
  if (names.length === 0) return t('goals.noLinkedHabits')
  return joinNames(names, i18n.language, (count) => t('habits.flow.tags.more', { count }))
}

const styles = StyleSheet.create({
  note: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20, textAlign: 'center' },
})
