'use client'

import { useState, useCallback, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
import { HabitFormFields } from './habit-form-fields'
import { useHabitForm } from '@/hooks/use-habit-form'
import { useTagSelection } from '@/hooks/use-tag-selection'
import { useUpdateHabit, useHabitDetail } from '@/hooks/use-habits'
import { useAssignTags } from '@/hooks/use-tags'
import {
  applyHabitFormMode,
  buildEditHabitFormState,
  getErrorMessage,
  toggleSelectedId,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { buildUpdateHabitRequest, type HabitFormData } from '@/lib/habit-request-builders'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EditHabitModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  habit: NormalizedHabit | null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EditHabitModal({
  open,
  onOpenChange,
  habit,
}: Readonly<EditHabitModalProps>) {
  const t = useTranslations()
  const updateHabit = useUpdateHabit()
  const assignTags = useAssignTags()

  const formHelpers = useHabitForm()
  const tags = useTagSelection()
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([])
  const [validationError, setValidationError] = useState('')
  const [detailFetchError, setDetailFetchError] = useState('')
  const [originalEndDate, setOriginalEndDate] = useState('')
  const [reminderTimes, setReminderTimes] = useState<number[]>([0, 15])

  const atGoalLimit = selectedGoalIds.length >= 10

  // Fetch detail to get dueDate, dueTime, endDate etc.
  const { data: habitDetail, error: detailError } = useHabitDetail(open && habit ? habit.id : null)

  const toggleGoal = useCallback((goalId: string) => {
    setSelectedGoalIds((prev) => toggleSelectedId(prev, goalId))
  }, [])

  // Show detail fetch error
  useEffect(() => {
    if (detailError) {
      setDetailFetchError(getErrorMessage(detailError, t('errors.fetchHabits')))
    }
  }, [detailError, t])

  // Populate form when modal opens or detail loads
  useEffect(() => {
    if (!open || !habit) return

    setValidationError('')
    setDetailFetchError('')

    const prefill = buildEditHabitFormState(habit, habitDetail)
    formHelpers.form.reset(prefill.formValues)
    setOriginalEndDate(prefill.originalEndDate)
    setReminderTimes(prefill.reminderTimes)
    tags.resetTags(prefill.selectedTagIds)
    setSelectedGoalIds(prefill.selectedGoalIds)
    applyHabitFormMode(prefill.mode, formHelpers)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, habit, habitDetail])

  const handleSubmit = useCallback<NonNullable<React.ComponentProps<'form'>['onSubmit']>>(
    async (e) => {
      e.preventDefault()
      if (!habit) return
      setValidationError('')

      const error = formHelpers.validateAll()
      if (error) {
        setValidationError(error)
        return
      }

      const data = formHelpers.form.getValues() as unknown as HabitFormData
      const request = buildUpdateHabitRequest(data, formHelpers.isOneTime, originalEndDate, reminderTimes, selectedGoalIds)

      try {
        await updateHabit.mutateAsync({ habitId: habit.id, data: request })
        await assignTags.mutateAsync({ habitId: habit.id, tagIds: tags.selectedTagIds })
        onOpenChange(false)
      } catch {
        // Error handled by mutation
      }
    },
    [habit, formHelpers, originalEndDate, selectedGoalIds, reminderTimes, tags, updateHabit, assignTags, onOpenChange],
  )

  return (
    <AppOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={t('habits.editHabit')}
      description={t('habits.form.editDescription')}
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <HabitFormFields
          formHelpers={formHelpers}
          tags={tags}
          selectedGoalIds={selectedGoalIds}
          atGoalLimit={atGoalLimit}
          onToggleGoal={toggleGoal}
          reminderTimes={reminderTimes}
          onReminderTimesChange={setReminderTimes}
        />

        {/* Detail fetch error */}
        {detailFetchError && (
          <p className="text-sm text-red-500 font-medium">{detailFetchError}</p>
        )}

        {/* Validation error */}
        {validationError && (
          <p className="text-sm text-red-500 font-medium">{validationError}</p>
        )}

        {/* Mutation error */}
        {updateHabit.error && (
          <p className="text-sm text-red-500 font-medium">
            {updateHabit.error.message}
          </p>
        )}

        {/* Submit buttons */}
        <div className="flex gap-3 pt-3">
          <button
            type="button"
            className="flex-1 py-3.5 rounded-xl border border-border text-text-secondary font-semibold text-sm hover:bg-surface-elevated/80 transition-all duration-150"
            disabled={updateHabit.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="flex-[2] py-3.5 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-all active:scale-[0.98] shadow-[var(--shadow-glow)] disabled:opacity-50 flex items-center justify-center gap-2"
            disabled={updateHabit.isPending}
          >
            {updateHabit.isPending && (
              <Loader2 className="size-4 animate-spin" />
            )}
            {t('habits.saveChanges')}
          </button>
        </div>
      </form>
    </AppOverlay>
  )
}
