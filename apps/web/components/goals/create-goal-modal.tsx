'use client'

import { useState, useCallback, useMemo } from 'react'
import { Plus, X, Target, Flame } from 'lucide-react'
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
import {
  MAX_GOAL_DESCRIPTION_LENGTH,
} from '@orbit/shared/validation'

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
    (key: string, values?: Record<string, string | number | Date>) =>
      t(key, values),
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
  const [submitted, setSubmitted] = useState(false)

  const isSubmitting = createGoal.isPending
  const isStreak = isStreakGoal(goalType)

  // Per-field inline errors (shown after first submit attempt)
  const fieldErrors = useMemo(() => {
    if (!submitted) return {}
    const errs: Record<string, string> = {}
    const errorKey = validateGoalDraftInput(description, targetValue, unit)
    if (errorKey) {
      const translated = translateErrorKey(translate, errorKey)
      if (translated) {
        if (errorKey === 'goals.form.targetValueRequired') errs.targetValue = translated
        else if (errorKey === 'goals.form.unitRequired' || errorKey === 'goals.form.unitTooLong') errs.unit = translated
        else if (errorKey === 'goals.form.titleRequired' || errorKey === 'goals.form.titleTooLong') errs.description = translated
        else errs._form = translated
      }
    }
    return errs
  }, [submitted, description, targetValue, unit, translate])

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
    setSubmitted(false)
  }

  const onSubmit = useCallback<NonNullable<React.ComponentProps<'form'>['onSubmit']>>(
    async (e) => {
      e.preventDefault()
      setSubmitted(true)

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
        {/* Goal Type Cards */}
        <div className="grid grid-cols-2 gap-3">
          {/* Progress Card */}
          <button
            type="button"
            onClick={() => handleTypeChange('Standard')}
            className={`relative text-left p-4 rounded-[var(--radius-xl)] border-2 transition-all duration-200 ${
              goalType === 'Standard'
                ? 'border-primary bg-primary/8 shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.1)]'
                : 'border-border-muted bg-surface-elevated/50 hover:border-border hover:bg-surface-elevated'
            }`}
          >
            <div className={`size-9 rounded-[var(--radius-lg)] flex items-center justify-center mb-3 ${
              goalType === 'Standard'
                ? 'bg-primary/15 text-primary'
                : 'bg-surface-elevated text-text-muted'
            }`}>
              <Target className="size-[18px]" />
            </div>
            <p className={`text-sm font-bold mb-0.5 ${
              goalType === 'Standard' ? 'text-text-primary' : 'text-text-secondary'
            }`}>
              {t('goals.form.typeStandard')}
            </p>
            <p className="text-[11px] text-text-muted leading-snug">
              {t('goals.form.typeStandardDescription')}
            </p>
            <p className="text-[10px] text-text-muted/60 mt-1.5 italic leading-snug">
              {t('goals.form.typeStandardExample')}
            </p>
          </button>

          {/* Streak Card */}
          <button
            type="button"
            onClick={() => handleTypeChange('Streak')}
            className={`relative text-left p-4 rounded-[var(--radius-xl)] border-2 transition-all duration-200 ${
              goalType === 'Streak'
                ? 'border-orange-500 bg-orange-500/8 shadow-[0_0_20px_rgba(249,115,22,0.1)]'
                : 'border-border-muted bg-surface-elevated/50 hover:border-border hover:bg-surface-elevated'
            }`}
          >
            <div className={`size-9 rounded-[var(--radius-lg)] flex items-center justify-center mb-3 ${
              goalType === 'Streak'
                ? 'bg-orange-500/15 text-orange-400'
                : 'bg-surface-elevated text-text-muted'
            }`}>
              <Flame className="size-[18px]" />
            </div>
            <p className={`text-sm font-bold mb-0.5 ${
              goalType === 'Streak' ? 'text-text-primary' : 'text-text-secondary'
            }`}>
              {t('goals.form.typeStreak')}
            </p>
            <p className="text-[11px] text-text-muted leading-snug">
              {t('goals.form.typeStreakDescription')}
            </p>
            <p className="text-[10px] text-text-muted/60 mt-1.5 italic leading-snug">
              {t('goals.form.typeStreakExample')}
            </p>
          </button>
        </div>

        {/* Streak how-it-works hints */}
        {isStreak && (
          <div className="space-y-2 -mt-1">
            <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-[var(--radius-lg)] bg-green-500/8 border border-green-500/15">
              <span className="text-xs mt-px shrink-0">+</span>
              <p className="text-[11px] text-green-300/90 leading-relaxed">
                {t('goals.form.typeStreakHintGood')}
              </p>
            </div>
            <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-[var(--radius-lg)] bg-red-500/8 border border-red-500/15">
              <span className="text-xs mt-px shrink-0">!</span>
              <p className="text-[11px] text-red-300/90 leading-relaxed">
                {t('goals.form.typeStreakHintBad')}
              </p>
            </div>
          </div>
        )}

        {/* Form Fields */}
        <div className="space-y-4">
          {/* Quantity + Unit */}
          <div className={isStreak ? '' : 'grid grid-cols-2 gap-3'}>
            <div>
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
                aria-invalid={!!fieldErrors.targetValue}
                aria-describedby={fieldErrors.targetValue ? 'create-goal-target-error' : undefined}
              />
              {fieldErrors.targetValue && (
                <p id="create-goal-target-error" className="text-xs text-destructive mt-1" role="alert">{fieldErrors.targetValue}</p>
              )}
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
                  aria-invalid={!!fieldErrors.unit}
                  aria-describedby={fieldErrors.unit ? 'create-goal-unit-error' : undefined}
                />
                {fieldErrors.unit && (
                  <p id="create-goal-unit-error" className="text-xs text-destructive mt-1" role="alert">{fieldErrors.unit}</p>
                )}
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
              placeholder={isStreak ? t('goals.form.streakDescriptionPlaceholder') : t('goals.form.descriptionPlaceholder')}
              maxLength={MAX_GOAL_DESCRIPTION_LENGTH}
              aria-invalid={!!fieldErrors.description}
              aria-describedby={fieldErrors.description ? 'create-goal-description-error' : undefined}
            />
            {fieldErrors.description && (
              <p id="create-goal-description-error" className="text-xs text-destructive mt-1" role="alert">{fieldErrors.description}</p>
            )}
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
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className={`w-full py-3.5 rounded-[var(--radius-xl)] text-white font-bold text-sm text-center transition-all duration-150 active:scale-[0.98] disabled:opacity-50 ${
            isStreak
              ? 'bg-orange-500 hover:bg-orange-500/90 shadow-[0_0_20px_rgba(249,115,22,0.2)]'
              : 'bg-primary hover:bg-primary/90 shadow-[var(--shadow-glow)]'
          }`}
        >
          {isSubmitting ? '...' : t('goals.create')}
        </button>
      </form>
    </AppOverlay>
  )
}
