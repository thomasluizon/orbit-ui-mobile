import { useState, useCallback, useMemo } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Plus, X, Target, Flame } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { AppDatePicker } from '@/components/ui/app-date-picker'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { KeyboardAwareBottomSheetScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { PillButton } from '@/components/ui/pill-button'
import { useAppToast } from '@/hooks/use-app-toast'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
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
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import type { GoalType } from '@orbit/shared/types/goal'
import { MAX_GOAL_DESCRIPTION_LENGTH, MAX_GOAL_UNIT_LENGTH } from '@orbit/shared/validation'

interface CreateGoalModalProps {
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

const goalTypeOptions = [
  {
    key: 'Standard',
    titleKey: 'goals.form.typeStandard',
    descKey: 'goals.form.typeStandardDescription',
    icon: Target,
  },
  {
    key: 'Streak',
    titleKey: 'goals.form.typeStreak',
    descKey: 'goals.form.typeStreakHintGood',
    hintKey: 'goals.form.typeStreakHintBad',
    icon: Flame,
  },
] as const

export function CreateGoalModal({ open, onClose }: CreateGoalModalProps) {
  const { t } = useTranslation()
  const translate = useCallback(
    (key: string, values?: Record<string, unknown>) => t(key, values),
    [t],
  )
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const insets = useSafeAreaInsets()
  const createGoal = useCreateGoal()
  const { showError } = useAppToast()
  const styles = useMemo(
    () => createStyles(tokens, insets.bottom),
    [tokens, insets.bottom],
  )

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
      onClose()
    },
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

  const activeTypeOption =
    goalTypeOptions.find((option) => option.key === goalType) ?? goalTypeOptions[0]

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
      onClose()
      resetForm()
    } catch (error: unknown) {
      showError(
        getFriendlyErrorMessage(error, translate, 'goals.errors.create', 'goal'),
      )
    }
  }, [
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
      <BottomSheetModal
        open={open}
        onClose={onClose}
        title={t('goals.create')}
        snapPoints={['80%', '95%']}
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
          <View>
            <Text style={styles.fieldLabel}>{t('goals.form.description')}</Text>
            <BottomSheetAppTextInput
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
            />
            {fieldErrors.description ? (
              <Text style={styles.fieldError} accessibilityRole="alert">
                {fieldErrors.description}
              </Text>
            ) : null}
          </View>

          <View>
            <Text style={styles.fieldLabel}>{t('goals.form.type')}</Text>
            <View
              style={styles.typeRow}
              accessibilityRole="radiogroup"
              accessibilityLabel={t('goals.form.type')}
            >
              {goalTypeOptions.map((option) => {
                const isActive = goalType === option.key
                const OptionIcon = option.icon
                return (
                  <Pressable
                    key={option.key}
                    style={[
                      styles.typeOption,
                      isActive ? styles.typeOptionActive : styles.typeOptionInactive,
                    ]}
                    onPress={() => handleTypeChange(option.key)}
                    accessibilityRole="button"
                    accessibilityLabel={t(option.titleKey)}
                    accessibilityState={{ selected: isActive }}
                  >
                    <OptionIcon
                      size={18}
                      strokeWidth={1.8}
                      color={isActive ? tokens.fgOnPrimary : tokens.fg2}
                    />
                    <Text
                      style={[
                        styles.typeOptionText,
                        { color: isActive ? tokens.fgOnPrimary : tokens.fg2 },
                      ]}
                    >
                      {t(option.titleKey)}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
            <View style={styles.typeCaption}>
              <Text style={styles.typeDesc}>{t(activeTypeOption.descKey)}</Text>
              {'hintKey' in activeTypeOption && activeTypeOption.hintKey ? (
                <Text style={styles.typeHint}>{t(activeTypeOption.hintKey)}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.row}>
            <View style={isStreak ? styles.fullField : styles.halfField}>
              <Text style={styles.fieldLabel}>
                {isStreak
                  ? t('goals.form.streakTarget')
                  : t('goals.form.targetValue')}
              </Text>
              <BottomSheetAppTextInput
                value={targetValue}
                onChangeText={setTargetValue}
                keyboardType="decimal-pad"
                placeholder={
                  isStreak ? t('goals.form.streakTargetPlaceholder') : '0'
                }
                placeholderTextColor={tokens.fg3}
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
                  value={unit}
                  onChangeText={setUnit}
                  placeholder={t('goals.form.unitPlaceholder')}
                  placeholderTextColor={tokens.fg3}
                  maxLength={MAX_GOAL_UNIT_LENGTH}
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

          <View>
            <Text style={styles.fieldLabel}>
              {t('goals.form.deadline')}{' '}
              <Text style={styles.labelOptional}>
                ({t('goals.form.deadlineOptional')})
              </Text>
            </Text>
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
                    <X size={16} color={tokens.fg4} strokeWidth={1.8} />
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
                <Plus size={14} color={tokens.fg1} strokeWidth={1.8} />
                <Text style={styles.addDeadlineText}>
                  {t('goals.form.addDeadline')}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.footer}>
            <PillButton
              variant="ghost"
              style={styles.footerButton}
              disabled={isSubmitting}
              onPress={dismissGuard.requestDismiss}
              accessibilityLabel={t('common.cancel')}
            >
              {t('common.cancel')}
            </PillButton>
            <PillButton
              style={styles.footerButton}
              onPress={onSubmit}
              disabled={isSubmitting}
              accessibilityLabel={t('goals.create')}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={tokens.fgOnPrimary} />
              ) : (
                t('goals.create')
              )}
            </PillButton>
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
    row: {
      flexDirection: 'row',
      gap: 12,
    },
    halfField: {
      flex: 1,
    },
    fullField: {
      flex: 1,
    },
    fieldLabel: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 14,
      color: tokens.fg2,
      marginBottom: 8,
    },
    labelOptional: {
      fontFamily: 'Rubik_400Regular',
      color: tokens.fg4,
    },
    fieldError: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 12,
      color: tokens.statusOverdueText,
      marginTop: 6,
    },
    typeRow: {
      flexDirection: 'row',
      gap: 10,
    },
    typeOption: {
      flex: 1,
      minHeight: 46,
      borderRadius: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    typeOptionActive: {
      backgroundColor: tokens.primary,
    },
    typeOptionInactive: {
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    typeOptionText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 15,
    },
    typeCaption: {
      marginTop: 10,
    },
    typeDesc: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 12,
      color: tokens.fg3,
      lineHeight: 18,
    },
    typeHint: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 11,
      color: tokens.fg4,
      lineHeight: 16,
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
      width: 44,
      height: 44,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    warningText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.statusOverdueText,
      marginTop: 8,
    },
    addDeadlineButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
      alignSelf: 'flex-start',
    },
    addDeadlineText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      color: tokens.fg1,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingTop: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: tokens.hairline,
      marginTop: 8,
    },
    footerButton: {
      flex: 1,
    },
  })
}
