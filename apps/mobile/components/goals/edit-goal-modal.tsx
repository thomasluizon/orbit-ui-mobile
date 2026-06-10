import { useState, useCallback, useEffect, useMemo } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Plus, X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { AppDatePicker } from '@/components/ui/app-date-picker'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { KeyboardAwareBottomSheetScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { SectionLabel } from '@/components/ui/section-label'
import { useAppToast } from '@/hooks/use-app-toast'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
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
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { MAX_GOAL_DESCRIPTION_LENGTH } from '@orbit/shared/validation'

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

export function EditGoalModal({ open, onClose, goal }: EditGoalModalProps) {
  const { t } = useTranslation()
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
    onDismiss: onClose,
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

  useEffect(() => {
    if (open) {
       
      setDescription(goal.title)
      setTargetValue(String(goal.targetValue))
      setUnit(goal.unit)
      setDeadline(goal.deadline ?? '')
      setSubmitted(false)
    }
  }, [open, goal.deadline, goal.targetValue, goal.title, goal.unit])

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
      onClose()
    } catch (error: unknown) {
      showError(
        getFriendlyErrorMessage(error, translate, 'goals.errors.update', 'goal'),
      )
    }
  }, [
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

  return (
    <>
      <BottomSheetModal
        open={open}
        onClose={onClose}
        title={t('goals.detail.edit')}
        snapPoints={['70%', '90%']}
        canDismiss={dismissGuard.canDismiss}
        isDirty={isDirty}
        onAttemptDismiss={dismissGuard.requestDismiss}
      >
        <KeyboardAwareBottomSheetScrollView
          style={styles.scroll}
          contentContainerStyle={styles.form}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
        >
          {isStreak ? (
            <Text style={styles.eyebrow}>{t('goals.form.typeStreak')}</Text>
          ) : null}

          <View style={styles.titleField}>
            <BottomSheetAppTextInput
              value={description}
              onChangeText={setDescription}
              placeholder={t('goals.form.descriptionPlaceholder')}
              placeholderTextColor={tokens.fg4}
              maxLength={MAX_GOAL_DESCRIPTION_LENGTH}
              accessibilityLabel={t('goals.form.description')}
              style={[styles.titleInput, { color: tokens.fg1 }]}
            />
            {fieldErrors.description ? (
              <Text style={styles.fieldError} accessibilityRole="alert">
                {fieldErrors.description}
              </Text>
            ) : null}
          </View>

          <View>
            <SectionLabel top={4} bottom={8}>
              {t('goals.form.target')}
            </SectionLabel>
            <View style={styles.row}>
              <View style={isStreak ? styles.fullField : styles.halfField}>
                <Text style={styles.fieldLabel}>
                  {isStreak
                    ? t('goals.form.streakTarget')
                    : t('goals.form.targetValue')}
                </Text>
                <BottomSheetAppTextInput
                  style={styles.input}
                  value={targetValue}
                  onChangeText={setTargetValue}
                  keyboardType="decimal-pad"
                  accessibilityLabel={
                    isStreak
                      ? t('goals.form.streakTarget')
                      : t('goals.form.targetValue')
                  }
                />
                {fieldErrors.targetValue ? (
                  <Text style={styles.fieldError} accessibilityRole="alert">
                    {fieldErrors.targetValue}
                  </Text>
                ) : null}
              </View>
              {!isStreak ? (
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>{t('goals.form.unit')}</Text>
                  <BottomSheetAppTextInput
                    style={styles.input}
                    value={unit}
                    onChangeText={setUnit}
                    maxLength={50}
                    accessibilityLabel={t('goals.form.unit')}
                  />
                  {fieldErrors.unit ? (
                    <Text style={styles.fieldError} accessibilityRole="alert">
                      {fieldErrors.unit}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>

          <View>
            <SectionLabel top={4} bottom={8}>
              {t('goals.form.deadline')}{' '}
              <Text style={styles.labelOptional}>
                ({t('goals.form.deadlineOptional')})
              </Text>
            </SectionLabel>
            {deadline ? (
              <View>
                <View style={styles.deadlineRow}>
                  <View style={styles.deadlinePicker}>
                    <AppDatePicker value={deadline} onChange={setDeadline} />
                  </View>
                  <TouchableOpacity
                    style={styles.removeDeadlineButton}
                    onPress={() => setDeadline('')}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.clear')}
                  >
                    <X size={16} color={tokens.fg4} strokeWidth={1.6} />
                  </TouchableOpacity>
                </View>
                {isGoalDeadlinePast(deadline) ? (
                  <Text style={styles.warningText}>
                    {t('goals.form.deadlineInPast')}
                  </Text>
                ) : null}
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addDeadlineButton}
                onPress={() => setDeadline(formatAPIDate(new Date()))}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('goals.form.addDeadline')}
              >
                <Plus size={14} color={tokens.fg1} strokeWidth={1.6} />
                <Text style={styles.addDeadlineText}>
                  {t('goals.form.addDeadline')}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelButton}
              disabled={isSubmitting}
              onPress={dismissGuard.requestDismiss}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitButton, isSubmitting && styles.disabled]}
              onPress={onSubmit}
              disabled={isSubmitting}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('common.save')}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={tokens.fgOnPrimary} />
              ) : (
                <Text style={styles.submitText}>{t('common.save')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAwareBottomSheetScrollView>
      </BottomSheetModal>
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

function createStyles(
  tokens: ReturnType<typeof createTokensV2>,
  bottomInset: number,
) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    form: {
      paddingTop: 8,
      paddingHorizontal: 20,
      paddingBottom: Math.max(bottomInset, 16) + 24,
      gap: 18,
    },
    eyebrow: {
      fontFamily: 'Roboto_500Medium',
      fontSize: 11,
      letterSpacing: 0.66,
      color: tokens.fg3,
      textTransform: 'uppercase',
    },
    titleField: {
      borderBottomWidth: 1,
      borderBottomColor: tokens.hairlineStrong,
      paddingBottom: 8,
    },
    titleInput: {
      fontFamily: 'Rubik_600SemiBold',
      fontSize: 22,
      letterSpacing: -0.33,
      paddingVertical: 4,
      paddingHorizontal: 0,
      backgroundColor: 'transparent',
      borderWidth: 0,
    },
    row: {
      flexDirection: 'row',
      gap: 14,
    },
    halfField: {
      flex: 1,
      gap: 6,
    },
    fullField: {
      flex: 1,
      gap: 6,
    },
    fieldLabel: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 12,
      color: tokens.fg3,
    },
    labelOptional: {
      fontFamily: 'Rubik_400Regular',
      color: tokens.fg4,
    },
    input: {
      backgroundColor: 'transparent',
      borderBottomWidth: 1,
      borderBottomColor: tokens.hairline,
      paddingHorizontal: 0,
      paddingVertical: 8,
      fontSize: 16,
      color: tokens.fg1,
      fontFamily: 'Rubik_400Regular',
    },
    fieldError: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 12,
      fontStyle: 'italic',
      color: tokens.statusOverdue,
      marginTop: 4,
    },
    deadlineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    deadlinePicker: {
      flex: 1,
    },
    removeDeadlineButton: {
      width: 36,
      height: 36,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    warningText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      fontStyle: 'italic',
      color: tokens.statusOverdue,
      marginTop: 8,
    },
    addDeadlineButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 4,
    },
    addDeadlineText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      color: tokens.fg1,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      paddingTop: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: tokens.hairline,
      marginTop: 8,
    },
    cancelButton: {
      paddingVertical: 10,
      paddingHorizontal: 6,
    },
    cancelButtonText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      color: tokens.fg3,
    },
    submitButton: {
      backgroundColor: tokens.primary,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minWidth: 120,
    },
    submitText: {
      fontFamily: 'Rubik_600SemiBold',
      fontSize: 14,
      color: tokens.fgOnPrimary,
    },
    disabled: {
      opacity: 0.5,
    },
  })
}
