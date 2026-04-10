'use client'

import { useState, useCallback } from 'react'
import { Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
import { AppDatePicker } from '@/components/ui/app-date-picker'
import { useAppToast } from '@/hooks/use-app-toast'
import { useCreateGoal } from '@/hooks/use-goals'
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
import type { GoalType } from '@orbit/shared/types/goal'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CreateGoalModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface CreateGoalRequest {
  title: string
  targetValue: number
  unit: string
  deadline?: string
  type?: GoalType
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateGoalModal({ open, onOpenChange }: Readonly<CreateGoalModalProps>) {
  const t = useTranslations()
  const translate = useCallback(
    (key: string, values?: Record<string, unknown>) =>
      t(key as Parameters<typeof t>[0], values as never),
    [t],
  )
  const createGoal = useCreateGoal()
  const { showError } = useAppToast()

  // Form state
  const [goalType, setGoalType] = useState<GoalType>('Standard')
  const [description, setDescription] = useState('')
  const [targetValue, setTargetValue] = useState('')
  const [unit, setUnit] = useState('')
  const [deadline, setDeadline] = useState('')

  const isSubmitting = createGoal.isPending
  const isStreak = isStreakGoal(goalType)

  function handleTypeChange(type: GoalType) {
    setGoalType(type)
    if (type === 'Streak') {
      setUnit(t('goals.form.streakUnit'))
    } else {
      setUnit('')
    }
  }

  function validate(): string | null {
    return translateErrorKey(
      translate,
      validateGoalDraftInput(description, targetValue, unit),
    )
  }

  function buildTitle(): string {
    return buildGoalTitle(description, targetValue, unit)
  }

  function resetForm() {
    setGoalType('Standard')
    setDescription('')
    setTargetValue('')
    setUnit('')
    setDeadline('')
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
        const request: CreateGoalRequest = {
          title,
          targetValue: parsedTargetValue,
          unit: unit.trim(),
          type: goalType,
        }
        if (deadline) request.deadline = deadline

        await createGoal.mutateAsync(request)
        onOpenChange(false)
        resetForm()
      } catch (error) {
        showError(getFriendlyErrorMessage(error, translate, 'goals.errors.create', 'goal'))
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [createGoal, deadline, description, goalType, onOpenChange, showError, targetValue, translate, unit],
  )

  // Reset form when modal closes
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) resetForm()
      onOpenChange(isOpen)
    },
    [onOpenChange],
  )

  return (
    <AppOverlay
      open={open}
      onOpenChange={handleOpenChange}
      title={t('goals.create')}
    >
      <form className="space-y-5" onSubmit={onSubmit}>
        {/* Goal Type Toggle */}
        <div className="flex gap-2">
          <button
            type="button"
            className={`flex-1 py-2.5 rounded-[var(--radius-lg)] text-xs font-semibold transition-all ${
              goalType === 'Standard'
                ? 'bg-primary text-white'
                : 'bg-surface-elevated text-text-secondary hover:text-text-primary'
            }`}
            onClick={() => handleTypeChange('Standard')}
          >
            {t('goals.form.typeStandard')}
          </button>
          <button
            type="button"
            className={`flex-1 py-2.5 rounded-[var(--radius-lg)] text-xs font-semibold transition-all ${
              goalType === 'Streak'
                ? 'bg-primary text-white'
                : 'bg-surface-elevated text-text-secondary hover:text-text-primary'
            }`}
            onClick={() => handleTypeChange('Streak')}
          >
            {t('goals.form.typeStreak')}
          </button>
        </div>

        {/* Streak description */}
        {isStreak && (
          <p className="text-xs text-text-secondary -mt-1">
            {t('goals.form.typeStreakDescription')}
          </p>
        )}

        {/* Quantity + Unit */}
        <div className={isStreak ? '' : 'grid grid-cols-2 gap-3'}>
          <div className={isStreak ? '' : ''}>
            <label
              htmlFor="create-goal-target"
              className="form-label"
            >
              {isStreak ? t('goals.form.streakTarget') : t('goals.form.targetValue')}
            </label>
            <input
              id="create-goal-target"
              type="number"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              className="form-input"
              min={0.01}
              step="any"
              placeholder={isStreak ? t('goals.form.streakTargetPlaceholder') : '12'}
            />
          </div>
          {!isStreak && (
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
          )}
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
          {isSubmitting ? '...' : t('goals.create')}
        </button>
      </form>
    </AppOverlay>
  )
}
