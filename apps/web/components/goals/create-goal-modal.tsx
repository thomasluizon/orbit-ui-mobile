'use client'

import { useState, useCallback, useMemo } from 'react'
import { Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
import { AppDatePicker } from '@/components/ui/app-date-picker'
import { useCreateGoal } from '@/hooks/use-goals'
import { formatAPIDate } from '@orbit/shared/utils'
import type { CreateGoalRequest } from '@orbit/shared/types/goal'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CreateGoalModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateGoalModal({ open, onOpenChange }: CreateGoalModalProps) {
  const t = useTranslations()
  const createGoal = useCreateGoal()

  // Form state
  const [description, setDescription] = useState('')
  const [targetValue, setTargetValue] = useState<number | null>(null)
  const [unit, setUnit] = useState('')
  const [deadline, setDeadline] = useState('')
  const [validationError, setValidationError] = useState('')

  const isSubmitting = createGoal.isPending

  const deadlineIsPast = useMemo(() => {
    if (!deadline) return false
    return deadline < formatAPIDate(new Date())
  }, [deadline])

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

  function resetForm() {
    setDescription('')
    setTargetValue(null)
    setUnit('')
    setDeadline('')
    setValidationError('')
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

      if (targetValue === null) return

      try {
        const title = buildTitle()
        const request: CreateGoalRequest = {
          title,
          targetValue,
          unit: unit.trim(),
        }
        if (deadline) request.deadline = deadline

        await createGoal.mutateAsync(request)
        onOpenChange(false)
        resetForm()
      } catch {
        // Error handled by mutation
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targetValue, unit, description, deadline, createGoal, onOpenChange],
  )

  // Reset form when modal closes
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) resetForm()
      onOpenChange(isOpen)
    },
    [onOpenChange],
  )

  const mutationError = createGoal.error?.message ?? null

  return (
    <AppOverlay
      open={open}
      onOpenChange={handleOpenChange}
      title={t('goals.create')}
    >
      <form className="space-y-5" onSubmit={onSubmit}>
        {/* Quantity + Unit */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="create-goal-target"
              className="form-label"
            >
              {t('goals.form.targetValue')}
            </label>
            <input
              id="create-goal-target"
              type="number"
              value={targetValue ?? ''}
              onChange={(e) =>
                setTargetValue(
                  e.target.value === '' ? null : Number(e.target.value),
                )
              }
              className="form-input"
              min={0.01}
              step="any"
              placeholder="12"
            />
          </div>
          <div>
            <label
              htmlFor="create-goal-unit"
              className="form-label"
            >
              {t('goals.form.unit')}
            </label>
            <input
              id="create-goal-unit"
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="form-input"
              placeholder={t('goals.form.unitPlaceholder')}
              maxLength={50}
            />
          </div>
        </div>

        {/* Description (optional) */}
        <div>
          <label
            htmlFor="create-goal-description"
            className="form-label"
          >
            {t('goals.form.description')}
            <span className="text-text-muted font-normal ml-1">({t('goals.form.descriptionOptional')})</span>
          </label>
          <input
            id="create-goal-description"
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
          {isSubmitting ? '...' : t('goals.create')}
        </button>
      </form>
    </AppOverlay>
  )
}
