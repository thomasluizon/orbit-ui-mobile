import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import type { HabitFormSuggestionPatch } from '@orbit/shared/utils'

type SuggestionScheduleTarget = Pick<
  HabitFormHelpers,
  'form' | 'setFlexible' | 'setRecurring' | 'setOneTime'
>

export function applySuggestionSchedule(
  patch: HabitFormSuggestionPatch,
  target: SuggestionScheduleTarget,
): void {
  if (patch.emoji) {
    target.form.setValue('emoji', patch.emoji, { shouldDirty: true })
  }

  if (patch.mode === 'flexible') {
    target.setFlexible()
    if (patch.frequencyUnit) {
      target.form.setValue('frequencyUnit', patch.frequencyUnit, { shouldDirty: true })
    }
    if (patch.frequencyQuantity) {
      target.form.setValue('frequencyQuantity', patch.frequencyQuantity, { shouldDirty: true })
    }
  } else if (patch.mode === 'recurring') {
    target.setRecurring()
    if (patch.frequencyUnit) {
      target.form.setValue('frequencyUnit', patch.frequencyUnit, { shouldDirty: true })
    }
    if (patch.frequencyQuantity) {
      target.form.setValue('frequencyQuantity', patch.frequencyQuantity, { shouldDirty: true })
    }
    target.form.setValue('days', patch.days, { shouldDirty: true })
  } else {
    target.setOneTime()
  }

  if (patch.dueTime) {
    target.form.setValue('dueTime', patch.dueTime, { shouldDirty: true })
  }
}

export function applySuggestionChecklist(
  patch: HabitFormSuggestionPatch,
  form: HabitFormHelpers['form'],
): boolean {
  if (patch.checklistItems.length === 0) return false
  const existingChecklist = form.getValues('checklistItems') ?? []
  form.setValue('checklistItems', [...existingChecklist, ...patch.checklistItems], {
    shouldDirty: true,
  })
  return true
}
