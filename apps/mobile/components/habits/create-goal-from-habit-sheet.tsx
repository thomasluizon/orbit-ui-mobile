import { useBackendFieldErrors } from '@/hooks/use-backend-field-errors'
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Text, View, type TextInput } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { DiscardChangesSheet } from '@/components/ui/discard-changes-sheet'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'

import { PillButton } from '@/components/ui/pill-button'
import { ActionRow } from '@/components/ui/action-row'
import { useAppToast } from '@/hooks/use-app-toast'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
import { useCreateGoal } from '@/hooks/use-goals'
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
  validateGoalDraftInput,
} from '@orbit/shared/utils/goal-form'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import type { GoalType } from '@orbit/shared/types/goal'
import { MAX_GOAL_DESCRIPTION_LENGTH } from '@orbit/shared/validation'
import { GoalDeadlineField } from './create-goal-from-habit/goal-deadline-field'
import { GoalTargetFields } from './create-goal-from-habit/goal-target-fields'
import { GoalTypeSelector } from './create-goal-from-habit/goal-type-selector'
import { createStyles } from './create-goal-from-habit/styles'

interface CreateGoalFromHabitSheetProps {
  open: boolean
  onClose: () => void
}

interface CreateGoalRequest {
  title: string
  targetValue: number
  unit: string
  deadline?: string
  type?: 'Standard' | 'Streak'
}

export function CreateGoalFromHabitSheet({ open, onClose }: Readonly<CreateGoalFromHabitSheetProps>) {
  const { t } = useTranslation()
  const { sheetRef, closeSheet } = useSheetHost()
  const translate = useCallback(
    (key: string, values?: Record<string, unknown>) => t(key, values),
    [t],
  )
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const createGoal = useCreateGoal()
  const { showError } = useAppToast()
  const styles = useMemo(() => createStyles(tokens), [tokens])

  const [goalType, setGoalType] = useState<GoalType>('Standard')
  const [description, setDescription] = useState('')
  const [targetValue, setTargetValue] = useState('')
  const [unit, setUnit] = useState('')
  const [deadline, setDeadline] = useState('')
  const descriptionRef = useRef<TextInput>(null)
  const targetRef = useRef<TextInput>(null)
  const unitRef = useRef<TextInput>(null)
  const [focusRequest, setFocusRequest] = useState<{ field: 'description' | 'targetValue' | 'unit' } | null>(null)
  useEffect(() => {
    if (focusRequest?.field === 'description') descriptionRef.current?.focus()
    else if (focusRequest?.field === 'targetValue') targetRef.current?.focus()
    else if (focusRequest?.field === 'unit') unitRef.current?.focus()
  }, [focusRequest])
  const backendErrors = useBackendFieldErrors({ description, targetValue, unit }, { description: 'Title', targetValue: 'TargetValue', unit: 'Unit' })
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
    backendErrors.clearBackendErrors()
  }, [backendErrors])

  const dismissGuard = useDismissGuard({
    isDirty,
    onDismiss: () =>
      closeSheet(() => {
        resetForm()
        onClose()
      }),
  })

  const localFieldErrors = useMemo(() => {
    if (!submitted) return {}
    const errs: Record<string, string> = {}
    const errorKey = validateGoalDraftInput(description, targetValue, unit)
    if (errorKey) {
      const translated = translateErrorKey(translate, errorKey)
      if (translated) {
        if (errorKey === 'goals.form.targetValueRequired')
          errs.targetValue = translated
        else if (
          errorKey === 'goals.form.unitRequired' ||
          errorKey === 'goals.form.unitTooLong'
        )
          errs.unit = translated
        else if (
          errorKey === 'goals.form.titleRequired' ||
          errorKey === 'goals.form.titleTooLong'
        )
          errs.description = translated
        else errs._form = translated
      }
    }
    return errs
  }, [submitted, description, targetValue, unit, translate])

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
    [t],
  )

  const onSubmit = useCallback(async () => {
    setSubmitted(true)
    const err = translateErrorKey(
      translate,
      validateGoalDraftInput(description, targetValue, unit),
    )
    if (err) {
      showError(err)
      const field = getFirstGoalDraftFieldError(getGoalDraftFieldErrorKeys(description, targetValue, unit))
      if (field) setFocusRequest({ field: field.field })
      return
    }

    const numVal = parseGoalTargetValue(targetValue)
    if (numVal === null) return

    try {
      const title = buildGoalTitle(description, targetValue, unit)
      const request: CreateGoalRequest = {
        title,
        targetValue: numVal,
        unit: unit.trim(),
        type: goalType,
      }
      if (deadline) request.deadline = deadline

      await createGoal.mutateAsync(request)
      closeSheet(() => {
        onClose()
        resetForm()
      })
    } catch (error: unknown) {
      const { field, handled } = backendErrors.reportBackendErrors(error)
      if (field) setFocusRequest({ field })
      if (handled) return
      showError(
        getFriendlyErrorMessage(error, translate, 'goals.errors.create', 'goal'),
      )
    }
  }, [
    backendErrors,
    closeSheet,
    createGoal,
    deadline,
    description,
    goalType,
    onClose,
    resetForm,
    showError,
    targetValue,
    translate,
    unit,
  ])

  return (
    <>
      {open ? (<Sheet
        ref={sheetRef}
        open
        onClose={dismissGuard.canDismiss ? onClose : undefined}
        onAttemptDismiss={dismissGuard.requestDismiss}
        title={t('goals.create')}
        actions={(
          <ActionRow>
            <PillButton size="sm" variant="ghost" disabled={isSubmitting} onClick={dismissGuard.requestDismiss}>
              {t('common.cancel')}
            </PillButton>
            <PillButton size="sm" onClick={() => void onSubmit()} disabled={isSubmitting} loading={isSubmitting}>
              {t('goals.create')}
            </PillButton>
          </ActionRow>
        )}
      >
        <View style={styles.form}>
          <View>
            <Text style={styles.fieldLabel}>{t('goals.form.description')}</Text>
            <BottomSheetAppTextInput
              ref={descriptionRef}
              value={description}
              onChangeText={setDescription}
              placeholder={
                isStreak
                  ? t('goals.form.streakDescriptionPlaceholder')
                  : t('goals.form.descriptionPlaceholder')
              }
              placeholderTextColor={tokens.fg3}
              maxLength={MAX_GOAL_DESCRIPTION_LENGTH}
              accessibilityLabel={t('goals.form.description')}
              accessibilityHint={fieldErrors.description}
            />
            {fieldErrors.description ? (
              <Text style={styles.fieldError} accessibilityRole="alert">
                {fieldErrors.description}
              </Text>
            ) : null}
          </View>

          <GoalTypeSelector
            styles={styles}
            goalType={goalType}
            onTypeChange={handleTypeChange}
          />

          <GoalTargetFields
            targetRef={targetRef}
            unitRef={unitRef}
            tokens={tokens}
            styles={styles}
            isStreak={isStreak}
            targetValue={targetValue}
            unit={unit}
            fieldErrors={fieldErrors}
            onChangeTarget={setTargetValue}
            onChangeUnit={setUnit}
          />

          <GoalDeadlineField
            tokens={tokens}
            styles={styles}
            deadline={deadline}
            onChangeDeadline={setDeadline}
          />
        </View>
      </Sheet>) : null}
      <DiscardChangesSheet
        open={dismissGuard.showDiscardDialog}
        onKeepEditing={dismissGuard.cancelDismiss}
        onDiscard={dismissGuard.confirmDismiss}
      />
    </>
  )
}
