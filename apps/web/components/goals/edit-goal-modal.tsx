'use client'

import { useState, useCallback, useEffect } from 'react'
import { Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
import { AppDatePicker } from '@/components/ui/app-date-picker'
import { useAppToast } from '@/hooks/use-app-toast'
import { useUpdateGoal } from '@/hooks/use-goals'
import { formatAPIDate } from '@orbit/shared/utils/dates'
import {
  getFriendlyErrorMessage,
  translateErrorKey,
} from '@orbit/shared/utils'
import {
  buildGoalTitle,
  isGoalDeadlinePast,
  isStreakGoal,
  parseGoalTargetValue,
  validateGoalDraftInput,
} from '@orbit/shared/utils/goal-form'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EditGoalModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  goal: {
    id: string
    title: string
    targetValue: number
    unit: string
    deadline: string | null
    type?: string
  }
}

interface UpdateGoalRequest {
  title: string
  targetValue: number
  unit: string
  deadline?: string | null
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
  const translate = useCallback(
    (key: string, values?: Record<string, unknown>) =>
      t(key as Parameters<typeof t>[0], values as never),
    [t],
  )
  const updateGoal = useUpdateGoal()
  const { showError } = useAppToast()

  const isStreak = isStreakGoal(goal.type)

  // Form state
  const [description, setDescription] = useState('')
  const [targetValue, setTargetValue] = useState('')
  const [unit, setUnit] = useState('')
  const [deadline, setDeadline] = useState('')

  const isSubmitting = updateGoal.isPending

  // Load goal data when modal opens
  useEffect(() => {
    if (open) {
      setDescription(goal.title)
      setTargetValue(String(goal.targetValue))
      setUnit(goal.unit)
      setDeadline(goal.deadline ?? '')
    }
  }, [open, goal])

  function validate(): string | null {
    return translateErrorKey(
      translate,
      validateGoalDraftInput(description, targetValue, unit),
    )
  }

  function buildTitle(): string {
    return buildGoalTitle(description, targetValue, unit)
  }

  const onSubmit = useCallback<NonNullable<React.ComponentProps<'form'>['onSubmit']>>(
    async (e) => {
      e.preventDefault()

      const err = validate()
      if (err) {
        showError(err)
        return
      }

      const parsedTargetValue = parseGoalTargetValue(targetValue)
      if (parsedTargetValue === null) return

      try {
        const title = buildTitle()
        const request: UpdateGoalRequest = {
          title,
          targetValue: parsedTargetValue,
          unit: unit.trim(),
          deadline: deadline || null,
        }

        await updateGoal.mutateAsync({ goalId: goal.id, data: request })
        onOpenChange(false)
      } catch (error) {
        showError(getFriendlyErrorMessage(error, translate, 'goals.errors.update', 'goal'))
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deadline, description, goal.id, onOpenChange, showError, targetValue, translate, unit, updateGoal],
  )

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      onOpenChange(isOpen)
    },
    [onOpenChange],
  )

  return (
    <AppOverlay
      open={open}
      onOpenChange={handleOpenChange}
      title={t('goals.detail.edit')}
    >
      <form className="space-y-5" onSubmit={onSubmit}>
        {/* Streak type badge */}
        {isStreak && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-400">
              {t('goals.form.typeStreak')}
            </span>
          </div>
        )}

        {/* Quantity + Unit */}
        <div className={isStreak ? '' : 'grid grid-cols-2 gap-3'}>
          <div>
            <label
              htmlFor="edit-goal-target"
              className="form-label"
            >
              {isStreak ? t('goals.form.streakTarget') : t('goals.form.targetValue')}
            </label>
            <input
              id="edit-goal-target"
              type="number"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              className="form-input"
              min={0.01}
              step="any"
            />
          </div>
          {!isStreak ? (
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
          ) : (
            <div>
              <label
                htmlFor="edit-goal-unit-readonly"
                className="form-label"
              >
                {t('goals.form.unit')}
              </label>
              <input
                id="edit-goal-unit-readonly"
                type="text"
                value={unit}
                readOnly
                className="form-input opacity-60 cursor-not-allowed"
              />
            </div>
          )}
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
              {deadline && isGoalDeadlinePast(deadline) && (
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
