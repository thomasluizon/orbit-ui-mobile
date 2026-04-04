'use client'

import { useState, useCallback, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
import { HabitFormFields } from './habit-form-fields'
import { useHabitForm } from '@/hooks/use-habit-form'
import { useTagSelection } from '@/hooks/use-tag-selection'
import { useUpdateHabit, useHabitDetail } from '@/hooks/use-habits'
import type { NormalizedHabit, UpdateHabitRequest } from '@orbit/shared/types/habit'

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
}: EditHabitModalProps) {
  const t = useTranslations()
  const updateHabit = useUpdateHabit()

  const formHelpers = useHabitForm()
  const tags = useTagSelection()
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([])
  const [validationError, setValidationError] = useState('')
  const [originalEndDate, setOriginalEndDate] = useState('')

  const atGoalLimit = selectedGoalIds.length >= 5

  // Fetch detail to get dueDate, dueTime, endDate etc.
  const { data: habitDetail } = useHabitDetail(open && habit ? habit.id : null)

  const toggleGoal = useCallback((goalId: string) => {
    setSelectedGoalIds((prev) => {
      const idx = prev.indexOf(goalId)
      if (idx >= 0) return prev.filter((id) => id !== goalId)
      return [...prev, goalId]
    })
  }, [])

  // Populate form when modal opens or detail loads
  useEffect(() => {
    if (!open || !habit) return

    formHelpers.form.reset({
      title: habit.title,
      description: habit.description || '',
      frequencyUnit: habit.frequencyUnit,
      frequencyQuantity: habit.frequencyQuantity,
      days: [...(habit.days || [])],
      isBadHabit: habit.isBadHabit,
      isGeneral: habit.isGeneral ?? false,
      isFlexible: habit.isFlexible ?? false,
      dueDate: habitDetail?.dueDate ?? habit.dueDate ?? '',
      dueTime: habitDetail?.dueTime?.slice(0, 5) ?? habit.dueTime?.slice(0, 5) ?? '',
      dueEndTime: habitDetail?.dueEndTime?.slice(0, 5) ?? habit.dueEndTime?.slice(0, 5) ?? '',
      endDate: habitDetail?.endDate ?? '',
      reminderEnabled: habit.reminderEnabled ?? false,
      scheduledReminders: habit.scheduledReminders ?? [],
      slipAlertEnabled: habit.slipAlertEnabled ?? false,
      checklistItems: habit.checklistItems ? [...habit.checklistItems] : [],
    })

    setOriginalEndDate(habitDetail?.endDate ?? '')
    tags.resetTags(habit.tags?.map((t) => t.id) ?? [])
    setSelectedGoalIds(habit.linkedGoals?.map((g) => g.id) ?? [])
    setValidationError('')

    // Set mode based on habit data
    if (habit.isGeneral) {
      formHelpers.setGeneral()
    } else if (habit.isFlexible) {
      formHelpers.setFlexible()
    } else if (habit.frequencyUnit) {
      formHelpers.setRecurring()
    } else {
      formHelpers.setOneTime()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, habit, habitDetail])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!habit) return
      setValidationError('')

      const error = formHelpers.validateAll()
      if (error) {
        setValidationError(error)
        return
      }

      const data = formHelpers.form.getValues()

      const request: UpdateHabitRequest = {
        title: data.title,
        isBadHabit: data.isBadHabit,
        isGeneral: data.isGeneral,
        isFlexible: data.isFlexible,
      }

      if (data.description) request.description = data.description

      if (!data.isGeneral) {
        if (data.dueDate) request.dueDate = data.dueDate

        if (data.frequencyUnit) {
          request.frequencyUnit = data.frequencyUnit
          request.frequencyQuantity = data.frequencyQuantity ?? undefined
          if (data.days?.length) request.days = data.days
          if (data.endDate) {
            request.endDate = data.endDate
          } else if (originalEndDate && !data.endDate) {
            request.clearEndDate = true
          }
        }

        if (data.dueTime) {
          request.dueTime = data.dueTime
          request.dueEndTime = data.dueEndTime || undefined
          request.reminderEnabled = data.reminderEnabled
        } else {
          request.reminderEnabled = false
        }
      }

      request.slipAlertEnabled = data.isBadHabit ? data.slipAlertEnabled : false
      if (data.checklistItems?.length) request.checklistItems = data.checklistItems
      request.goalIds = selectedGoalIds

      try {
        await updateHabit.mutateAsync({ habitId: habit.id, data: request })
        onOpenChange(false)
      } catch {
        // Error handled by mutation
      }
    },
    [habit, formHelpers, originalEndDate, selectedGoalIds, updateHabit, onOpenChange],
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
        />

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
