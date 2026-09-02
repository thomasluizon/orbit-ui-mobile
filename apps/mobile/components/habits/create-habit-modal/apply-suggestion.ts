import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import type { HabitFormSuggestionPatch } from '@orbit/shared/utils'
import { MAX_CHECKLIST_ITEMS, MAX_SUB_HABITS } from '@orbit/shared/validation'

type SuggestionScheduleTarget = Pick<
  HabitFormHelpers,
  'form' | 'isFlexible' | 'isRecurring' | 'isOneTime' | 'setFlexible' | 'setRecurring' | 'setOneTime'
>

function matchesSuggestionMode(
  patch: HabitFormSuggestionPatch,
  target: SuggestionScheduleTarget,
): boolean {
  if (patch.mode === 'flexible') return target.isFlexible
  if (patch.mode === 'recurring') return target.isRecurring
  return target.isOneTime
}

function hasSameDays(current: string[] | undefined, proposed: string[]): boolean {
  return current?.length === proposed.length && proposed.every((day) => current.includes(day))
}

function applySuggestionMode(
  patch: HabitFormSuggestionPatch,
  target: SuggestionScheduleTarget,
): boolean {
  if (matchesSuggestionMode(patch, target)) return false
  if (patch.mode === 'oneTime') target.setOneTime()
  else if (patch.mode === 'flexible') target.setFlexible()
  else target.setRecurring()
  return true
}

function applySuggestionField(
  target: SuggestionScheduleTarget,
  field: 'emoji' | 'frequencyUnit' | 'frequencyQuantity' | 'dueTime',
  value: string | number | null,
): boolean {
  if (!value || target.form.getValues(field) === value) return false
  target.form.setValue(field, value, { shouldDirty: true })
  return true
}

export function applySuggestionSchedule(
  patch: HabitFormSuggestionPatch,
  target: SuggestionScheduleTarget,
): boolean {
  let changed = applySuggestionField(target, 'emoji', patch.emoji)
  changed = applySuggestionMode(patch, target) || changed

  if (patch.mode === 'flexible' || patch.mode === 'recurring') {
    changed = applySuggestionField(target, 'frequencyUnit', patch.frequencyUnit) || changed
    changed = applySuggestionField(target, 'frequencyQuantity', patch.frequencyQuantity) || changed
  }

  if (patch.mode === 'recurring' && !hasSameDays(target.form.getValues('days'), patch.days)) {
    target.form.setValue('days', patch.days, { shouldDirty: true })
    changed = true
  }

  changed = applySuggestionField(target, 'dueTime', patch.dueTime) || changed

  return changed
}

export function applySuggestionChecklist(
  patch: HabitFormSuggestionPatch,
  form: HabitFormHelpers['form'],
): boolean {
  if (patch.checklistItems.length === 0) return false
  const existingChecklist = form.getValues('checklistItems') ?? []
  const suggestedChecklist = patch.checklistItems.slice(0, MAX_CHECKLIST_ITEMS - existingChecklist.length)
  if (suggestedChecklist.length === 0) return false
  form.setValue('checklistItems', [...existingChecklist, ...suggestedChecklist], {
    shouldDirty: true,
  })
  return true
}

export function selectSuggestedSubHabitTitles(
  existingValues: string[],
  suggestedTitles: string[],
  canUseSubHabits: boolean,
): string[] {
  if (!canUseSubHabits) return []
  const occupiedSlots = existingValues.filter((value) => value.trim().length > 0).length
  return suggestedTitles.slice(0, Math.max(0, MAX_SUB_HABITS - occupiedSlots))
}
