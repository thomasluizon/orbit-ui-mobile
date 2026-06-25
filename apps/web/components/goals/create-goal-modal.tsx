'use client'

import { useState, useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PillButton } from '@/components/ui/pill-button'
import { useAppToast } from '@/hooks/use-app-toast'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
import { useCreateGoal } from '@/hooks/use-goals'
import {
  getFriendlyErrorMessage,
  translateErrorKey,
} from '@orbit/shared/utils'
import {
  buildGoalTitle,
  isStreakGoal,
  parseGoalTargetValue,
  validateGoalDraftInput,
} from '@orbit/shared/utils/goal-form'
import type { GoalType } from '@orbit/shared/types/goal'
import { MAX_GOAL_DESCRIPTION_LENGTH } from '@orbit/shared/validation'
import { FieldWell } from './create-goal-modal/field-well'
import { GoalDeadlineField } from './create-goal-modal/goal-deadline-field'
import { GoalTargetFields } from './create-goal-modal/goal-target-fields'
import { GoalTypeSelector } from './create-goal-modal/goal-type-selector'

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

type GoalModalTranslateValues = Record<string, string | number | Date>
type GoalModalTranslateFn = (
  key: string,
  values?: GoalModalTranslateValues,
) => string

function buildGoalFieldErrors(
  submitted: boolean,
  description: string,
  targetValue: string,
  unit: string,
  translate: GoalModalTranslateFn,
): Record<string, string> {
  if (!submitted) return {}

  const errorKey = validateGoalDraftInput(description, targetValue, unit)
  if (!errorKey) return {}

  const translated = translateErrorKey(translate, errorKey)
  if (!translated) return {}

  if (errorKey === 'goals.form.targetValueRequired') {
    return { targetValue: translated }
  }

  if (
    errorKey === 'goals.form.unitRequired' ||
    errorKey === 'goals.form.unitTooLong'
  ) {
    return { unit: translated }
  }

  if (
    errorKey === 'goals.form.titleRequired' ||
    errorKey === 'goals.form.titleTooLong'
  ) {
    return { description: translated }
  }

  return { _form: translated }
}

function buildCreateGoalRequest(
  title: string,
  parsedTargetValue: number,
  unit: string,
  goalType: GoalType,
  deadline: string,
): CreateGoalRequest {
  return {
    title,
    targetValue: parsedTargetValue,
    unit: unit.trim(),
    type: goalType,
    ...(deadline ? { deadline } : {}),
  }
}

export function CreateGoalModal({ open, onOpenChange }: Readonly<CreateGoalModalProps>) {
  const t = useTranslations()
  const translate = useCallback(
    (key: string, values?: GoalModalTranslateValues) => t(key, values),
    [t],
  )
  const createGoal = useCreateGoal()
  const { showError } = useAppToast()

  const [goalType, setGoalType] = useState<GoalType>('Standard')
  const [description, setDescription] = useState('')
  const [targetValue, setTargetValue] = useState('')
  const [unit, setUnit] = useState('')
  const [deadline, setDeadline] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const isSubmitting = createGoal.isPending
  const isStreak = isStreakGoal(goalType)
  const isDirty =
    goalType !== 'Standard' ||
    description.trim().length > 0 ||
    targetValue.trim().length > 0 ||
    unit.trim().length > 0 ||
    deadline.length > 0

  const resetForm = useCallback(() => {
    setGoalType('Standard')
    setDescription('')
    setTargetValue('')
    setUnit('')
    setDeadline('')
    setSubmitted(false)
  }, [])

  const dismissGuard = useDismissGuard({
    isDirty,
    onDismiss: () => {
      resetForm()
      onOpenChange(false)
    },
  })

  const fieldErrors = useMemo(
    () =>
      buildGoalFieldErrors(
        submitted,
        description,
        targetValue,
        unit,
        translate,
      ),
    [submitted, description, targetValue, unit, translate],
  )

  const handleTypeChange = useCallback(
    (type: GoalType) => {
      setGoalType(type)
      if (type === 'Streak') {
        setUnit(t('goals.form.streakUnit'))
      } else {
        setUnit('')
      }
    },
    [t],
  )

  const onSubmit = useCallback<NonNullable<React.ComponentProps<'form'>['onSubmit']>>(
    async (e) => {
      e.preventDefault()
      setSubmitted(true)

      const err = translateErrorKey(
        translate,
        validateGoalDraftInput(description, targetValue, unit),
      )
      if (err) {
        showError(err)
        return
      }

      const parsedTargetValue = parseGoalTargetValue(targetValue)
      if (parsedTargetValue === null) return

      try {
        const title = buildGoalTitle(description, targetValue, unit)
        const request = buildCreateGoalRequest(
          title,
          parsedTargetValue,
          unit,
          goalType,
          deadline,
        )

        await createGoal.mutateAsync(request)
        onOpenChange(false)
        resetForm()
      } catch (error: unknown) {
        showError(getFriendlyErrorMessage(error, translate, 'goals.errors.create', 'goal'))
      }
    },
    [createGoal, deadline, description, goalType, onOpenChange, resetForm, showError, targetValue, translate, unit],
  )

  return (
    <>
      <AppOverlay
        open={open}
        onOpenChange={onOpenChange}
        title={t('goals.create')}
        canDismiss={dismissGuard.canDismiss}
        isDirty={isDirty}
        onAttemptDismiss={dismissGuard.requestDismiss}
      >
        <form id="create-goal-form" onSubmit={onSubmit} noValidate>
          <GoalTypeSelector goalType={goalType} onTypeChange={handleTypeChange} />

          <GoalTargetFields
            isStreak={isStreak}
            targetValue={targetValue}
            unit={unit}
            fieldErrors={fieldErrors}
            onChangeTarget={setTargetValue}
            onChangeUnit={setUnit}
          />

          <div style={{ padding: '16px 0 0' }}>
            <FieldWell
              label={t('goals.form.description')}
              id="create-goal-description"
              type="text"
              value={description}
              placeholder={
                isStreak
                  ? t('goals.form.streakDescriptionPlaceholder')
                  : t('goals.form.descriptionPlaceholder')
              }
              maxLength={MAX_GOAL_DESCRIPTION_LENGTH}
              error={fieldErrors.description}
              onChange={setDescription}
            />
          </div>

          <GoalDeadlineField deadline={deadline} onChangeDeadline={setDeadline} />

          <div
            className="flex items-center"
            style={{
              gap: 12,
              padding: '18px 0 8px',
            }}
          >
            <PillButton
              variant="ghost"
              className="flex-1"
              onClick={dismissGuard.requestDismiss}
            >
              {t('common.cancel')}
            </PillButton>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 inline-flex cursor-pointer items-center justify-center rounded-full border-0 bg-[var(--primary)] text-[var(--fg-on-primary)] transition-[background-color,box-shadow,transform,opacity] duration-[var(--dur-fast)] ease-[var(--ease-standard)] enabled:hover:bg-[var(--primary-pressed)] enabled:hover:-translate-y-px enabled:hover:shadow-[var(--primary-glow-hover)] enabled:active:translate-y-0 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 16,
                fontWeight: 500,
                padding: '15px 26px',
                boxShadow: isSubmitting ? 'none' : 'var(--primary-glow)',
              }}
            >
              {isSubmitting ? '...' : t('goals.create')}
            </button>
          </div>
        </form>
      </AppOverlay>
      <ConfirmDialog
        open={dismissGuard.showDiscardDialog}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) dismissGuard.cancelDismiss()
        }}
        title={t('common.discardChangesTitle')}
        description={t('common.discardChangesDescription')}
        confirmLabel={t('common.discard')}
        cancelLabel={t('common.keepEditing')}
        onConfirm={dismissGuard.confirmDismiss}
        onCancel={dismissGuard.cancelDismiss}
        variant="warning"
      />
    </>
  )
}
