import { useState, useCallback, useMemo } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { DiscardChangesSheet } from '@/components/ui/discard-changes-sheet'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'

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
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { MAX_GOAL_DESCRIPTION_LENGTH } from '@orbit/shared/validation'
import { EditGoalDeadlineField } from './edit-goal-modal/edit-goal-deadline-field'
import { EditGoalTargetFields } from './edit-goal-modal/edit-goal-target-fields'
import { createStyles } from './edit-goal-modal/styles'

interface EditGoalModalProps {
  open: boolean
  onClose: () => void
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

export function EditGoalModal({ open, onClose, goal }: Readonly<EditGoalModalProps>) {
  const { t } = useTranslation()
  const { sheetRef, closeSheet } = useSheetHost()
  const translate = useCallback(
    (key: string, values?: Record<string, unknown>) => t(key, values),
    [t],
  )
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const insets = useSafeAreaInsets()
  const updateGoal = useUpdateGoal()
  const { showError } = useAppToast()
  const styles = useMemo(
    () => createStyles(tokens, insets.bottom),
    [tokens, insets.bottom],
  )

  const isStreak = isStreakGoal(goal.type)

  const [description, setDescription] = useState('')
  const [targetValue, setTargetValue] = useState('')
  const [unit, setUnit] = useState('')
  const [deadline, setDeadline] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const isSubmitting = updateGoal.isPending
  const isDirty =
    description !== goal.title ||
    targetValue !== String(goal.targetValue) ||
    unit !== goal.unit ||
    deadline !== (goal.deadline ?? '')
  const dismissGuard = useDismissGuard({
    isDirty,
    onDismiss: () => closeSheet(onClose),
  })

  const fieldErrors = useMemo(() => {
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

  const [prevResetKey, setPrevResetKey] = useState<string | null>(null)
  const resetKey = open
    ? `${goal.title}:${goal.targetValue}:${goal.unit}:${goal.deadline ?? ''}`
    : null
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey)
    if (open) {
      setDescription(goal.title)
      setTargetValue(String(goal.targetValue))
      setUnit(goal.unit)
      setDeadline(goal.deadline ?? '')
      setSubmitted(false)
    }
  }

  const onSubmit = useCallback(async () => {
    setSubmitted(true)
    const err = translateErrorKey(
      translate,
      validateGoalDraftInput(description, targetValue, unit),
    )
    if (err) {
      showError(err)
      return
    }

    const numVal = parseGoalTargetValue(targetValue)
    if (numVal === null) return

    try {
      const title = buildGoalTitle(description, targetValue, unit)
      const request: UpdateGoalRequest = {
        title,
        targetValue: numVal,
        unit: unit.trim(),
        deadline: deadline || null,
      }

      await updateGoal.mutateAsync({ goalId: goal.id, data: request })
      closeSheet(onClose)
    } catch (error: unknown) {
      showError(
        getFriendlyErrorMessage(error, translate, 'goals.errors.update', 'goal'),
      )
    }
  }, [
    closeSheet,
    deadline,
    description,
    goal.id,
    onClose,
    showError,
    targetValue,
    translate,
    unit,
    updateGoal,
  ])

  const eyebrowUnitSuffix = goal.unit ? `  ·  ${goal.unit}` : ''
  const eyebrowLabel = isStreak
    ? t('goals.form.typeStreak')
    : `${t('goals.form.typeStandard')}${eyebrowUnitSuffix}`

  return (
    <>
      {open ? (<Sheet
        ref={sheetRef}
        open
        onClose={dismissGuard.canDismiss ? onClose : undefined}
        onAttemptDismiss={dismissGuard.requestDismiss}
        title={t('goals.detail.edit')}
      >
        <View style={styles.form}>
          <Text style={styles.eyebrow}>{eyebrowLabel}</Text>

          <View>
            <Text style={styles.fieldLabel}>{t('goals.form.description')}</Text>
            <BottomSheetAppTextInput
              value={description}
              onChangeText={setDescription}
              placeholder={t('goals.form.descriptionPlaceholder')}
              placeholderTextColor={tokens.fg3}
              maxLength={MAX_GOAL_DESCRIPTION_LENGTH}
              accessibilityLabel={t('goals.form.description')}
            />
            {fieldErrors.description ? (
              <Text style={styles.fieldError} accessibilityRole="alert">
                {fieldErrors.description}
              </Text>
            ) : null}
          </View>

          <EditGoalTargetFields
            styles={styles}
            isStreak={isStreak}
            targetValue={targetValue}
            unit={unit}
            fieldErrors={fieldErrors}
            onChangeTarget={setTargetValue}
            onChangeUnit={setUnit}
          />

          <EditGoalDeadlineField
            tokens={tokens}
            styles={styles}
            deadline={deadline}
            onChangeDeadline={setDeadline}
          />

          <View style={styles.footer}>
            <PillButton
              variant="ghost"

              disabled={isSubmitting}
              onClick={dismissGuard.requestDismiss}

            >
              {t('common.cancel')}
            </PillButton>
            <PillButton
              onClick={() => void onSubmit()}
              disabled={isSubmitting}
              loading={isSubmitting}
            >
              {t('common.save')}
            </PillButton>
          </View>
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
