'use client'

import { useState, useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PillButton } from '@/components/ui/pill-button'
import { useAppToast } from '@/hooks/use-app-toast'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
import { useUpdateGoal } from '@/hooks/use-goals'
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
import { MAX_GOAL_DESCRIPTION_LENGTH } from '@orbit/shared/validation'
import { EditGoalDeadlineField } from './edit-goal-modal/edit-goal-deadline-field'
import { EditGoalTargetFields } from './edit-goal-modal/edit-goal-target-fields'
import { FieldWell } from './field-well'

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

export function EditGoalModal({
  open,
  onOpenChange,
  goal,
}: Readonly<EditGoalModalProps>) {
  const t = useTranslations()
  const translate = useCallback(
    (key: string, values?: Record<string, string | number | Date>) =>
      t(key, values),
    [t],
  )
  const updateGoal = useUpdateGoal()
  const { showError } = useAppToast()

  const isStreak = isStreakGoal(goal.type)

  const [description, setDescription] = useState(() => goal.title)
  const [targetValue, setTargetValue] = useState(() => String(goal.targetValue))
  const [unit, setUnit] = useState(() => goal.unit)
  const [deadline, setDeadline] = useState(() => goal.deadline ?? '')
  const [submitted, setSubmitted] = useState(false)

  const isSubmitting = updateGoal.isPending
  const isDirty =
    description !== goal.title ||
    targetValue !== String(goal.targetValue) ||
    unit !== goal.unit ||
    deadline !== (goal.deadline ?? '')
  const dismissGuard = useDismissGuard({
    isDirty,
    onDismiss: () => onOpenChange(false),
  })

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

  const [previousSession, setPreviousSession] = useState<{ open: boolean; id: string | null }>({
    open,
    id: open ? goal.id : null,
  })
  const nextSessionId = open ? goal.id : null
  if (previousSession.open !== open || previousSession.id !== nextSessionId) {
    setPreviousSession({ open, id: nextSessionId })
    if (open && (!previousSession.open || previousSession.id !== goal.id)) {
      setDescription(goal.title)
      setTargetValue(String(goal.targetValue))
      setUnit(goal.unit)
      setDeadline(goal.deadline ?? '')
      setSubmitted(false)
    }
  }

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
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
        const request: UpdateGoalRequest = {
          title,
          targetValue: parsedTargetValue,
          unit: unit.trim(),
          deadline: deadline || null,
        }

        await updateGoal.mutateAsync({ goalId: goal.id, data: request })
        onOpenChange(false)
      } catch (error: unknown) {
        showError(getFriendlyErrorMessage(error, translate, 'goals.errors.update', 'goal'))
      }
    },
    [deadline, description, goal.id, onOpenChange, showError, targetValue, translate, unit, updateGoal],
  )

  return (
    <>
      <AppOverlay
        open={open}
        onOpenChange={onOpenChange}
        title={t('goals.detail.edit')}
        canDismiss={dismissGuard.canDismiss}
        isDirty={isDirty}
        onAttemptDismiss={dismissGuard.requestDismiss}
      >
        <form onSubmit={(e) => void onSubmit(e)} noValidate>
          <div className="t-eyebrow" style={{ padding: '10px 0' }}>
            {isStreak
              ? t('goals.form.typeStreak')
              : `${t('goals.form.typeStandard')}${goal.unit ? `  ·  ${goal.unit}` : ''}`}
          </div>

          <div style={{ padding: '6px 0 0' }}>
            <FieldWell
              label={t('goals.form.description')}
              id="edit-goal-description"
              type="text"
              value={description}
              placeholder={t('goals.form.descriptionPlaceholder')}
              maxLength={MAX_GOAL_DESCRIPTION_LENGTH}
              error={fieldErrors.description}
              onChange={setDescription}
            />
          </div>

          <EditGoalTargetFields
            isStreak={isStreak}
            targetValue={targetValue}
            unit={unit}
            fieldErrors={fieldErrors}
            onChangeTarget={setTargetValue}
            onChangeUnit={setUnit}
          />

          <EditGoalDeadlineField deadline={deadline} onChangeDeadline={setDeadline} />

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
            <PillButton
              type="submit"
              className="flex-1"
              disabled={isSubmitting}
              busy={isSubmitting}
            >
              {t('common.save')}
            </PillButton>
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
