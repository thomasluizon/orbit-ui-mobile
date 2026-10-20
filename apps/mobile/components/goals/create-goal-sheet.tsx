import { useAccountScopedState } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useBackendFieldErrors } from '@/hooks/use-backend-field-errors'
import { useCallback, useMemo, useRef, useEffect } from 'react'
import { Text, View, type TextInput } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { DiscardChangesSheet } from '@/components/ui/discard-changes-sheet'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'

import { Plus } from '@/components/ui/icons'
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
} from '@orbit/shared/utils/goal-form'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { ListRow } from '@/components/ui/list-row'
import { GoalHabitsPicker } from './goal-habits-field'
import type { CreateGoalRequest, GoalType } from '@orbit/shared/types/goal'
import { MAX_GOAL_TITLE_LENGTH, validateGoalForm } from '@orbit/shared/validation'
import { GoalDeadlineField } from '../habits/create-goal-from-habit/goal-deadline-field'
import { GoalTargetFields } from '../habits/create-goal-from-habit/goal-target-fields'
import { GoalTypeSelector } from '../habits/create-goal-from-habit/goal-type-selector'
import { createStyles } from '../habits/create-goal-from-habit/styles'

interface CreateGoalSheetProps {
  open: boolean
  onClose: () => void
  initialHabitIds?: string[]
  onCreated?: (goalId: string) => void
}


export function CreateGoalSheet({ open, onClose, initialHabitIds = [], onCreated }: Readonly<CreateGoalSheetProps>) {
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

  const [goalType, setGoalType] = useAccountScopedState<GoalType>('Standard')
  const [description, setDescription] = useAccountScopedState('')
  const [targetValue, setTargetValue] = useAccountScopedState('')
  const [unit, setUnit] = useAccountScopedState('')
  const [deadline, setDeadline] = useAccountScopedState('')
  const [habitIds, setHabitIds] = useAccountScopedState<string[]>(initialHabitIds)
  const [selectingHabits, setSelectingHabits] = useAccountScopedState(false)
  const descriptionRef = useRef<TextInput>(null)
  const targetRef = useRef<TextInput>(null)
  const unitRef = useRef<TextInput>(null)
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

  const resetForm = () => {
    setGoalType('Standard')
    setDescription('')
    setTargetValue('')
    setUnit('')
    setDeadline('')
    setHabitIds(initialHabitIds)
    setSubmitted(false)
    setFormError('')
    backendErrors.clearBackendErrors()
  }

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
    const errorKey = validateGoalForm(description, parseGoalTargetValue(targetValue), unit)
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

  const handleTypeChange = (type: GoalType) => {
    setGoalType(type)
    setUnit(type === 'Streak' ? t('goals.form.streakUnit') : '')
  }

  const onSubmit = async () => {
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

    const numVal = parseGoalTargetValue(targetValue)
    if (numVal === null) return

    const accountGeneration = getAccountGeneration()
    try {
      const title = buildGoalTitle(description, targetValue, unit)
      const request: CreateGoalRequest = {
        title,
        targetValue: numVal,
        unit: unit.trim(),
        type: goalType,
        habitIds,
      }
      if (deadline) request.deadline = deadline

      const created = await createGoal.mutateAsync(request)
      if (getAccountGeneration() !== accountGeneration) return
      const finishSave = () => {
        if (getAccountGeneration() !== accountGeneration) return
        onCreated?.(created.id)
        onClose()
        resetForm()
      }
      closeSheet(finishSave, finishSave)
    } catch (error: unknown) {
      if (getAccountGeneration() !== accountGeneration) return
      const { field, handled } = backendErrors.reportBackendErrors(error)
      if (field) setFocusRequest({ field })
      if (handled) return
      setFormError(getFriendlyErrorMessage(error, translate, 'goals.form.createError', 'goal'))
    }
  }

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
            <PillButton size="sm" leadingIcon={<Plus size={16} strokeWidth={2} />} onClick={() => void onSubmit()} disabled={isSubmitting} loading={isSubmitting}>
              {t('goals.create')}
            </PillButton>
          </ActionRow>
        )}
      >
        <View style={styles.form}>
          <View>
            <Text style={styles.fieldLabel}>{t('goals.form.title')}</Text>
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
              maxLength={MAX_GOAL_TITLE_LENGTH}
              accessibilityLabel={t('goals.form.title')}
              accessibilityHint={fieldErrors.description ?? t('common.required')}
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
          {formError ? <Text accessibilityRole="alert" style={styles.fieldError}>{formError}</Text> : null}
          <ListRow title={t('goals.linkedHabits')} value={t('habits.form.selectedCount', { count: habitIds.length })} placement="column" disabled={isSubmitting} onClick={() => closeSheet(() => setSelectingHabits(true))} />
        </View>
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
