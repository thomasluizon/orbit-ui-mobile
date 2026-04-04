'use client'

import { useState, useCallback, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
import { HabitFormFields } from './habit-form-fields'
import { useHabitForm } from '@/hooks/use-habit-form'
import { useTagSelection } from '@/hooks/use-tag-selection'
import { useCreateHabit, useCreateSubHabit } from '@/hooks/use-habits'
import { formatAPIDate } from '@orbit/shared/utils'
import type { NormalizedHabit, CreateHabitRequest, CreateSubHabitRequest } from '@orbit/shared/types/habit'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CreateHabitModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDate?: string | null
  parentHabit?: NormalizedHabit | null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateHabitModal({
  open,
  onOpenChange,
  initialDate,
  parentHabit,
}: CreateHabitModalProps) {
  const t = useTranslations()
  const createHabit = useCreateHabit()
  const createSubHabit = useCreateSubHabit()
  const isSubHabitMode = !!parentHabit

  const formHelpers = useHabitForm({
    initialData: {
      dueDate: initialDate ?? formatAPIDate(new Date()),
    },
  })

  const tags = useTagSelection()
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([])
  const [subHabits, setSubHabits] = useState<string[]>([])
  const [validationError, setValidationError] = useState('')

  const atGoalLimit = selectedGoalIds.length >= 5

  const toggleGoal = useCallback((goalId: string) => {
    setSelectedGoalIds((prev) => {
      const idx = prev.indexOf(goalId)
      if (idx >= 0) return prev.filter((id) => id !== goalId)
      return [...prev, goalId]
    })
  }, [])

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      formHelpers.form.reset({
        title: '',
        description: '',
        frequencyUnit: null,
        frequencyQuantity: null,
        days: [],
        isBadHabit: false,
        isGeneral: false,
        isFlexible: false,
        dueDate: initialDate ?? formatAPIDate(new Date()),
        dueTime: '',
        dueEndTime: '',
        endDate: '',
        reminderEnabled: false,
        scheduledReminders: [],
        slipAlertEnabled: false,
        checklistItems: [],
      })
      tags.resetTags()
      setSelectedGoalIds([])
      setSubHabits([])
      setValidationError('')

      // Prefill from parent if sub-habit mode
      if (parentHabit) {
        formHelpers.form.setValue('isBadHabit', parentHabit.isBadHabit)
        if (parentHabit.isGeneral) {
          formHelpers.setGeneral()
        } else if (parentHabit.isFlexible) {
          formHelpers.setFlexible()
        } else if (parentHabit.frequencyUnit) {
          formHelpers.setRecurring()
          formHelpers.form.setValue('frequencyUnit', parentHabit.frequencyUnit)
          formHelpers.form.setValue('frequencyQuantity', parentHabit.frequencyQuantity)
          if (parentHabit.days?.length) {
            formHelpers.form.setValue('days', [...parentHabit.days])
          }
        }
        tags.resetTags(parentHabit.tags?.map((t) => t.id) ?? [])
        setSelectedGoalIds(parentHabit.linkedGoals?.map((g) => g.id) ?? [])
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setValidationError('')

      const error = formHelpers.validateAll()
      if (error) {
        setValidationError(error)
        return
      }

      const data = formHelpers.form.getValues()

      if (isSubHabitMode && parentHabit) {
        const subRequest: CreateSubHabitRequest = {
          title: data.title,
        }
        if (data.description) subRequest.description = data.description
        if (!data.isGeneral) {
          if (data.dueDate) subRequest.dueDate = data.dueDate
          if (data.isFlexible) {
            subRequest.isFlexible = true
            if (data.frequencyUnit) subRequest.frequencyUnit = data.frequencyUnit
            if (data.frequencyQuantity) subRequest.frequencyQuantity = data.frequencyQuantity ?? undefined
          } else if (data.frequencyUnit) {
            subRequest.frequencyUnit = data.frequencyUnit
            subRequest.frequencyQuantity = data.frequencyQuantity ?? undefined
            if (data.days?.length) subRequest.days = data.days
            if (data.endDate) subRequest.endDate = data.endDate
          }
          if (data.dueTime) subRequest.dueTime = data.dueTime
        }
        if (data.isBadHabit) {
          subRequest.isBadHabit = true
          subRequest.slipAlertEnabled = data.slipAlertEnabled
        }
        if (data.checklistItems?.length) subRequest.checklistItems = data.checklistItems
        if (tags.selectedTagIds.length) subRequest.tagIds = tags.selectedTagIds

        try {
          await createSubHabit.mutateAsync({
            parentId: parentHabit.id,
            data: subRequest,
          })
          onOpenChange(false)
        } catch {
          // Error handled by mutation
        }
      } else {
        const request: CreateHabitRequest = {
          title: data.title,
          isBadHabit: data.isBadHabit,
        }
        if (data.description) request.description = data.description
        if (data.isGeneral) {
          request.isGeneral = true
        } else {
          if (data.dueDate) request.dueDate = data.dueDate
          if (data.isFlexible) {
            request.isFlexible = true
            if (data.frequencyUnit) request.frequencyUnit = data.frequencyUnit
            if (data.frequencyQuantity) request.frequencyQuantity = data.frequencyQuantity
          } else if (data.frequencyUnit) {
            request.frequencyUnit = data.frequencyUnit
            request.frequencyQuantity = data.frequencyQuantity ?? undefined
            if (data.days?.length) request.days = data.days
            if (data.endDate) request.endDate = data.endDate
          }
          if (data.dueTime) {
            request.dueTime = data.dueTime
            if (data.dueEndTime) request.dueEndTime = data.dueEndTime
            request.reminderEnabled = data.reminderEnabled
          }
        }
        if (data.isBadHabit) request.slipAlertEnabled = data.slipAlertEnabled
        if (data.checklistItems?.length) request.checklistItems = data.checklistItems
        if (tags.selectedTagIds.length) request.tagIds = tags.selectedTagIds
        if (selectedGoalIds.length) request.goalIds = selectedGoalIds
        // Sub-habits
        const filteredSubHabits = subHabits.filter((s) => s.trim())
        if (filteredSubHabits.length) request.subHabits = filteredSubHabits

        try {
          await createHabit.mutateAsync(request)
          onOpenChange(false)
        } catch {
          // Error handled by mutation
        }
      }
    },
    [formHelpers, isSubHabitMode, parentHabit, tags, selectedGoalIds, subHabits, createHabit, createSubHabit, onOpenChange],
  )

  const isPending = createHabit.isPending || createSubHabit.isPending

  return (
    <AppOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={isSubHabitMode ? t('habits.createSubHabit') : t('habits.createHabit')}
      description={
        isSubHabitMode
          ? t('habits.form.createSubHabitDescription')
          : t('habits.form.createDescription')
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <HabitFormFields
          formHelpers={formHelpers}
          tags={tags}
          selectedGoalIds={selectedGoalIds}
          atGoalLimit={atGoalLimit}
          onToggleGoal={toggleGoal}
        >
          {/* Sub-habits (create-only, not in sub-habit mode) */}
          {!isSubHabitMode && (
            <div className="space-y-1.5">
              <span className="form-label" aria-hidden="true">
                {t('habits.form.subHabits')}
              </span>
              {subHabits.length > 0 && (
                <div className="space-y-1.5">
                  {subHabits.map((_, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        value={subHabits[index]}
                        type="text"
                        placeholder={t('habits.form.subHabitPlaceholder')}
                        className="flex-1 bg-surface text-text-primary placeholder-text-muted rounded-lg py-3 px-4 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                        onChange={(e) => {
                          const next = [...subHabits]
                          next[index] = e.target.value
                          setSubHabits(next)
                        }}
                      />
                      <button
                        type="button"
                        className="shrink-0 p-2 text-text-muted hover:text-red-500 hover:bg-red-500/10 transition-all duration-150 rounded-full"
                        onClick={() =>
                          setSubHabits(subHabits.filter((_, i) => i !== index))
                        }
                      >
                        <span className="size-4 block">x</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                disabled={subHabits.length >= 20}
                onClick={() => setSubHabits([...subHabits, ''])}
              >
                <span className="size-3.5">+</span>
                {t('habits.form.addSubHabit')}
              </button>
            </div>
          )}
        </HabitFormFields>

        {/* Validation error */}
        {validationError && (
          <p className="text-sm text-red-500 font-medium">{validationError}</p>
        )}

        {/* Mutation error */}
        {(createHabit.error || createSubHabit.error) && (
          <p className="text-sm text-red-500 font-medium">
            {(createHabit.error || createSubHabit.error)?.message}
          </p>
        )}

        {/* Submit buttons */}
        <div className="flex gap-3 pt-3">
          <button
            type="button"
            className="flex-1 py-3.5 rounded-xl border border-border text-text-secondary font-semibold text-sm hover:bg-surface-elevated/80 transition-all duration-150"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="flex-[2] py-3.5 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-all active:scale-[0.98] shadow-[var(--shadow-glow)] disabled:opacity-50 flex items-center justify-center gap-2"
            disabled={isPending}
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            {isSubHabitMode
              ? t('habits.createSubHabit')
              : t('habits.createHabit')}
          </button>
        </div>
      </form>
    </AppOverlay>
  )
}
