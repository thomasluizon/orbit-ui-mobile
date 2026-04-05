'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
import { AppDatePicker } from '@/components/ui/app-date-picker'
import { useUpdateGoal } from '@/hooks/use-goals'
import { formatAPIDate } from '@orbit/shared/utils'
import type { Goal, UpdateGoalRequest } from '@orbit/shared/types/goal'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EditGoalModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  goal: Goal
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EditGoalModal({
  open,
  onOpenChange,
  goal,
}: Readonly<EditGoalModalProps>) {
  const t = useTranslations()
  const updateGoal = useUpdateGoal()

  // Form state
  const [description, setDescription] = useState('')
  const [targetValue, setTargetValue] = useState<number>(0)
  const [unit, setUnit] = useState('')
  const [deadline, setDeadline] = useState('')
  const [validationError, setValidationError] = useState('')

  const isSubmitting = updateGoal.isPending

  const deadlineIsPast = useMemo(() => {
    if (!deadline) return false
    return deadline < formatAPIDate(new Date())
  }, [deadline])

  // Load goal data when modal opens
  useEffect(() => {
    if (open) {
      setDescription(goal.title)
      setTargetValue(goal.targetValue)
      setUnit(goal.unit)
      setDeadline(goal.deadline ?? '')
      setValidationError('')
    }
  }, [open, goal])

  function validate(): string | null {
    if (!targetValue || targetValue <= 0) {
      return t('goals.form.targetValueRequired')
    }
    if (!unit.trim()) {
      return t('goals.form.unitRequired')
    }
    return null
  }

  function buildTitle(): string {
    return description.trim() || `${targetValue} ${unit.trim()}`
  }

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setValidationError('')

      const err = validate()
      if (err) {
        setValidationError(err)
        return
      }

      try {
        const title = buildTitle()
        const request: UpdateGoalRequest = {
          title,
          targetValue,
          unit: unit.trim(),
          deadline: deadline || null,
        }

        await updateGoal.mutateAsync({ goalId: goal.id, data: request })
        onOpenChange(false)
      } catch {
        // Error handled by mutation
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targetValue, unit, description, deadline, goal.id, updateGoal, onOpenChange],
  )

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        setValidationError('')
      }
      onOpenChange(isOpen)
    },
    [onOpenChange],
  )

  const mutationError = updateGoal.error?.message ?? null

  return (
    <AppOverlay
      open={open}
      onOpenChange={handleOpenChange}
      title={t('goals.detail.edit')}
    >
      <form className="space-y-5" onSubmit={onSubmit}>
        {/* Quantity + Unit */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="edit-goal-target"
              className="form-label"
            >
              {t('goals.form.targetValue')}
            </label>
            <input
              id="edit-goal-target"
              type="number"
              value={targetValue}
              onChange={(e) => setTargetValue(Number(e.target.value))}
              className="form-input"
              min={0.01}
              step="any"
            />
          </div>
          <div>
            <label
              htmlFor="edit-goal-unit"
              className="form-label"
            >
              {t('goals.form.unit')}
            </label>
            <input
              id="edit-goal-unit"
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="form-input"
              maxLength={50}
            />
          </div>
        </div>

        {/* Description (optional) */}
        <div>
          <label
            htmlFor="edit-goal-description"
            className="form-label"
          >
            {t('goals.form.description')}
            <span className="text-text-muted font-normal ml-1">({t('goals.form.descriptionOptional')})</span>
          </label>
          <input
            id="edit-goal-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="form-input"
            placeholder={t('goals.form.descriptionPlaceholder')}
            maxLength={200}
          />
        </div>

        {/* Deadline */}
        <div className="space-y-1.5">
          {deadline ? (
            <div className="space-y-1.5">
              <span className="form-label">
                {t('goals.form.deadline')}
                <span className="text-text-muted font-normal ml-1">({t('goals.form.deadlineOptional')})</span>
              </span>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <AppDatePicker
                    value={deadline}
                    onChange={setDeadline}
                  />
                </div>
                <button
                  type="button"
                  className="shrink-0 p-2 text-text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors rounded-full"
                  onClick={() => setDeadline('')}
                >
                  <X className="size-4" />
                </button>
              </div>
              {deadlineIsPast && (
                <p className="text-xs text-amber-400 font-medium">
                  {t('goals.form.deadlineInPast')}
                </p>
              )}
            </div>
          ) : (
            <div>
              <span className="form-label">
                {t('goals.form.deadline')}
                <span className="text-text-muted font-normal ml-1">({t('goals.form.deadlineOptional')})</span>
              </span>
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors mt-1.5"
                onClick={() => setDeadline(formatAPIDate(new Date()))}
              >
                <Plus className="size-3.5" />
                {t('goals.form.addDeadline')}
              </button>
            </div>
          )}
        </div>

        {/* Validation error */}
        {validationError && (
          <p className="text-red-400 text-xs">{validationError}</p>
        )}

        {/* Mutation error */}
        {mutationError && (
          <p className="text-red-400 text-xs">{mutationError}</p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3.5 rounded-[var(--radius-xl)] bg-primary text-white font-bold text-sm text-center hover:bg-primary/90 transition-all duration-150 active:scale-[0.98] shadow-[var(--shadow-glow)] disabled:opacity-50"
        >
          {isSubmitting ? '...' : t('common.save')}
        </button>
      </form>
    </AppOverlay>
  )
}
