'use client'

import { useBackendFieldErrors } from '@/hooks/use-backend-field-errors'

import { useCallback, useId, useMemo, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { DiscardChangesSheet } from '@/components/ui/discard-changes-sheet'
import { Sheet, useSheetHost } from '@/components/ui/sheet'

import { Plus } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'
import { ActionRow } from '@/components/ui/action-row'
import { useAppToast } from '@/hooks/use-app-toast'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
import { useCreateGoal } from '@/hooks/use-goals'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'
import {
  getFriendlyErrorMessage,
  translateErrorKey,
} from '@orbit/shared/utils'
import {
  buildGoalTitle,
  getFirstGoalDraftFieldError,
  getGoalDraftFieldErrorKeys,
  isStreakGoal,
  parseGoalTargetValue,
} from '@orbit/shared/utils/goal-form'
import { ListRow } from '@/components/ui/list-row'
import { GoalHabitsPicker } from './goal-habits-field'
import type { CreateGoalRequest, GoalType } from '@orbit/shared/types/goal'
import { MAX_GOAL_TITLE_LENGTH, validateGoalForm } from '@orbit/shared/validation'
import { FieldWell } from '@/components/goals/field-well'
import { GoalDeadlineField } from '../habits/create-goal-from-habit/goal-deadline-field'
import { GoalTargetFields } from '../habits/create-goal-from-habit/goal-target-fields'
import { GoalTypeSelector } from '../habits/create-goal-from-habit/goal-type-selector'

interface CreateGoalSheetProps {
  open: boolean
  onClose: () => void
  initialHabitIds?: string[]
  onCreated?: (goalId: string) => void
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

  const errorKey = validateGoalForm(description, parseGoalTargetValue(targetValue), unit)
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

export function CreateGoalSheet({ open, onClose, initialHabitIds = [], onCreated }: Readonly<CreateGoalSheetProps>) {
  const t = useTranslations()
  const translate = useCallback(
    (key: string, values?: GoalModalTranslateValues) => t(key, values),
    [t],
  )
  const createGoal = useCreateGoal()
  const { showError } = useAppToast()

  const [goalType, setGoalType] = useAccountScopedState<GoalType>('Standard')
  const [description, setDescription] = useAccountScopedState('')
  const [targetValue, setTargetValue] = useAccountScopedState('')
  const [unit, setUnit] = useAccountScopedState('')
  const [deadline, setDeadline] = useAccountScopedState('')
  const [habitIds, setHabitIds] = useAccountScopedState<string[]>(initialHabitIds)
  const [selectingHabits, setSelectingHabits] = useAccountScopedState(false)
  const descriptionRef = useRef<HTMLInputElement>(null)
  const targetRef = useRef<HTMLInputElement>(null)
  const unitRef = useRef<HTMLInputElement>(null)
  const [focusRequest, setFocusRequest] = useAccountScopedState<{ field: 'description' | 'targetValue' | 'unit' } | null>(null)
  useEffect(() => {
    if (focusRequest?.field === 'description') descriptionRef.current?.focus()
    else if (focusRequest?.field === 'targetValue') targetRef.current?.focus()
    else if (focusRequest?.field === 'unit') unitRef.current?.focus()
  }, [focusRequest])
  const backendErrors = useBackendFieldErrors({ description, targetValue, unit }, { description: 'Title', targetValue: 'TargetValue', unit: 'Unit' })
  const [submitted, setSubmitted] = useAccountScopedState(false)
  const [formError, setFormError] = useAccountScopedState('')

  const isSubmitting = createGoal.isPending
  const isStreak = isStreakGoal(goalType)
  const isDirty =
    goalType !== 'Standard' ||
    description.trim().length > 0 ||
    targetValue.trim().length > 0 ||
    unit.trim().length > 0 ||
    deadline.length > 0 ||
    habitIds.join() !== initialHabitIds.join()

  const resetForm = useCallback(() => {
    setGoalType('Standard')
    setDescription('')
    setTargetValue('')
    setUnit('')
    setDeadline('')
    setHabitIds(initialHabitIds)
    setSubmitted(false)
    setFormError('')
    backendErrors.clearBackendErrors()
  }, [backendErrors, initialHabitIds, setDeadline, setHabitIds, setDescription, setGoalType, setFormError, setSubmitted, setTargetValue, setUnit])

  const { sheetRef, closeSheet } = useSheetHost()
  const formId = useId()
  const dismissGuard = useDismissGuard({
    isDirty,
    onDismiss: () => {
      const accountGeneration = getAccountGeneration()
      closeSheet(() => {
        if (getAccountGeneration() !== accountGeneration) return
        resetForm()
        onClose()
      })
    },
  })

  const localFieldErrors = useMemo(
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

  const fieldErrors = { ...localFieldErrors, ...backendErrors.fieldErrors }

  const handleTypeChange = useCallback(
    (type: GoalType) => {
      setGoalType(type)
      if (type === 'Streak') {
        setUnit(t('goals.form.streakUnit'))
      } else {
        setUnit('')
      }
    },
    [setGoalType, setUnit, t],
  )

  const onSubmit = useCallback(
    async (e: React.SubmitEvent<HTMLFormElement>) => {
      e.preventDefault()
      setSubmitted(true)
      setFormError('')

      const err = translateErrorKey(
        translate,
        validateGoalForm(description, parseGoalTargetValue(targetValue), unit),
      )
      if (err) {
        showError(err)
        const field = getFirstGoalDraftFieldError(getGoalDraftFieldErrorKeys(description, targetValue, unit))
        if (err === translateErrorKey(translate, 'goals.form.titleRequired')) setFocusRequest({ field: 'description' })
        else if (field) setFocusRequest({ field: field.field })
        return
      }

      const parsedTargetValue = parseGoalTargetValue(targetValue)
      if (parsedTargetValue === null) return
      const accountGeneration = getAccountGeneration()

      try {
        const title = buildGoalTitle(description, targetValue, unit)
        const request = buildCreateGoalRequest(
          title,
          parsedTargetValue,
          unit,
          goalType,
          deadline,
        )

        const created = await createGoal.mutateAsync({ ...request, habitIds })
        if (getAccountGeneration() !== accountGeneration) return
        closeSheet(() => {
          if (getAccountGeneration() !== accountGeneration) return
          onCreated?.(created.id)
          onClose()
          resetForm()
        })
      } catch (error: unknown) {
        if (getAccountGeneration() !== accountGeneration) return
        const { field, handled } = backendErrors.reportBackendErrors(error)
        if (field) setFocusRequest({ field })
        if (handled) return
        setFormError(getFriendlyErrorMessage(error, translate, 'goals.form.createError', 'goal'))
      }
    },
    [backendErrors, setFocusRequest, closeSheet, createGoal, deadline, habitIds, description, goalType, onClose, onCreated, resetForm, setFormError, setSubmitted, showError, targetValue, translate, unit],
  )

  return (
    <>
      {open && !selectingHabits ? (<Sheet
        ref={sheetRef}
        open
        onClose={!isSubmitting && dismissGuard.canDismiss ? onClose : undefined}
        onAttemptDismiss={isSubmitting ? undefined : dismissGuard.requestDismiss}
        title={t('goals.create')}
        actions={(
          <ActionRow>
            <PillButton size="sm" variant="ghost" disabled={isSubmitting} onClick={dismissGuard.requestDismiss}>
              {t('common.cancel')}
            </PillButton>
            <PillButton size="sm" leadingIcon={<Plus size={16} strokeWidth={2} aria-hidden="true" />} formId={formId} disabled={isSubmitting} loading={isSubmitting}>
              {t('goals.create')}
            </PillButton>
          </ActionRow>
        )}
      >
        <form id={formId} onSubmit={(e) => void onSubmit(e)} noValidate>
          <div>
            <FieldWell
              inputRef={descriptionRef}
              label={t('goals.form.title')}
              id="create-goal-description"
              type="text"
              value={description}
              placeholder={
                isStreak
                  ? t('goals.form.streakDescriptionPlaceholder')
                  : t('goals.form.descriptionPlaceholder')
              }
              maxLength={MAX_GOAL_TITLE_LENGTH}
              required
              error={fieldErrors.description}
              onChange={setDescription}
            />
          </div>

          <div style={{ padding: "var(--orbit-space-16) var(--orbit-space-0) var(--orbit-space-0)" }}>
            <GoalTypeSelector goalType={goalType} onTypeChange={handleTypeChange} />
          </div>

          <GoalTargetFields
            targetRef={targetRef}
            unitRef={unitRef}
            isStreak={isStreak}
            targetValue={targetValue}
            unit={unit}
            fieldErrors={fieldErrors}
            onChangeTarget={setTargetValue}
            onChangeUnit={setUnit}
          />

          <GoalDeadlineField deadline={deadline} onChangeDeadline={setDeadline} />
          <ListRow title={t('goals.linkedHabits')} value={t('habits.form.selectedCount', { count: habitIds.length })} placement="column" disabled={isSubmitting} onClick={() => closeSheet(() => setSelectingHabits(true))} />
          {formError ? <p role="alert" className="pt-3 text-sm text-[var(--status-bad-text)]">{formError}</p> : null}
        </form>
      </Sheet>) : null}
      {open && selectingHabits ? <GoalHabitsPicker selectedIds={habitIds} onChange={setHabitIds} disabled={isSubmitting} onClose={() => setSelectingHabits(false)} /> : null}
      <DiscardChangesSheet
        open={dismissGuard.showDiscardDialog}
        onKeepEditing={dismissGuard.cancelDismiss}
        onDiscard={dismissGuard.confirmDismiss}
      />
    </>
  )
}
