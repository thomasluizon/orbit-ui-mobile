import { useState, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { Plus, X, Target, Flame } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
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
import { useAppTheme } from '@/lib/use-app-theme'
import type { GoalType } from '@orbit/shared/types/goal'
import { MAX_GOAL_DESCRIPTION_LENGTH } from '@orbit/shared/validation'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

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

type AppColors = {
  primary: string
  white: string
  textPrimary: string
  textMuted: string
  textSecondary: string
  surfaceElevated: string
  borderMuted: string
  amber400: string
  amber500: string
  red400: string
  orange400: string
  orange500: string
  orange300: string
}
const goalRadius = {
  lg: 16,
  xl: 20,
} as const

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateGoalModal({ open, onClose }: CreateGoalModalProps) {
  const { t } = useTranslation()
  const translate = useCallback(
    (key: string, values?: Record<string, unknown>) => t(key, values),
    [t],
  )
  const { colors } = useAppTheme()
  const insets = useSafeAreaInsets()
  const createGoal = useCreateGoal()
  const { showError } = useAppToast()
  const styles = useMemo(() => createStyles(colors, insets.bottom), [colors, insets.bottom])

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
    const err = validate()
    if (err) {
      showError(err)
      return
    }

    const numVal = parseGoalTargetValue(targetValue)
    if (numVal === null) return

    try {
      const title = buildTitle()
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
    } catch (error) {
      showError(getFriendlyErrorMessage(error, translate, 'goals.errors.create', 'goal'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createGoal, deadline, description, goalType, onClose, showError, targetValue, translate, unit])

  const handleClose = useCallback(() => {
    resetForm()
    onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose])

  const isStandardSelected = goalType === 'Standard'
  const isStreakSelected = goalType === 'Streak'

  return (
    <BottomSheetModal
      open={open}
      onClose={handleClose}
      title={t('goals.create')}
      snapPoints={['80%', '95%']}
    >
      <BottomSheetScrollView
        style={styles.scroll}
        contentContainerStyle={styles.form}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Goal Type Cards */}
        <View style={styles.typeCardsRow}>
          {/* Progress Card */}
          <TouchableOpacity
            style={[
              styles.typeCard,
              isStandardSelected && styles.typeCardSelectedStandard,
            ]}
            onPress={() => handleTypeChange('Standard')}
            activeOpacity={0.8}
          >
            <View style={[
              styles.typeCardIcon,
              isStandardSelected ? styles.typeCardIconSelectedStandard : styles.typeCardIconDefault,
            ]}>
              <Target size={18} color={isStandardSelected ? colors.primary : colors.textMuted} />
            </View>
            <Text style={[
              styles.typeCardTitle,
              isStandardSelected && styles.typeCardTitleSelected,
            ]}>
              {t('goals.form.typeStandard')}
            </Text>
            <Text style={styles.typeCardDescription}>
              {t('goals.form.typeStandardDescription')}
            </Text>
            <Text style={styles.typeCardExample}>
              {t('goals.form.typeStandardExample')}
            </Text>
          </TouchableOpacity>

          {/* Streak Card */}
          <TouchableOpacity
            style={[
              styles.typeCard,
              isStreakSelected && styles.typeCardSelectedStreak,
            ]}
            onPress={() => handleTypeChange('Streak')}
            activeOpacity={0.8}
          >
            <View style={[
              styles.typeCardIcon,
              isStreakSelected ? styles.typeCardIconSelectedStreak : styles.typeCardIconDefault,
            ]}>
              <Flame size={18} color={isStreakSelected ? (colors.orange400 ?? '#fb923c') : colors.textMuted} />
            </View>
            <Text style={[
              styles.typeCardTitle,
              isStreakSelected && styles.typeCardTitleSelected,
            ]}>
              {t('goals.form.typeStreak')}
            </Text>
            <Text style={styles.typeCardDescription}>
              {t('goals.form.typeStreakDescription')}
            </Text>
            <Text style={styles.typeCardExample}>
              {t('goals.form.typeStreakExample')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Streak how-it-works hints */}
        {isStreak && (
          <View style={styles.streakHints}>
            <View style={styles.streakHintGood}>
              <Text style={styles.streakHintIcon}>+</Text>
              <Text style={styles.streakHintGoodText}>
                {t('goals.form.typeStreakHintGood')}
              </Text>
            </View>
            <View style={styles.streakHintBad}>
              <Text style={styles.streakHintIcon}>!</Text>
              <Text style={styles.streakHintBadText}>
                {t('goals.form.typeStreakHintBad')}
              </Text>
            </View>
          </View>
        )}

        {/* Quantity + Unit */}
        <View style={styles.row}>
          <View style={isStreak ? styles.fullField : styles.halfField}>
            <Text style={styles.label}>
              {isStreak ? t('goals.form.streakTarget') : t('goals.form.targetValue')}
            </Text>
            <TextInput
              style={styles.input}
              value={targetValue}
              onChangeText={setTargetValue}
              keyboardType="decimal-pad"
              placeholder={isStreak ? t('goals.form.streakTargetPlaceholder') : '12'}
              placeholderTextColor={colors.textMuted}
            />
            {fieldErrors.targetValue && (
              <Text style={styles.fieldError} accessibilityRole="alert">{fieldErrors.targetValue}</Text>
            )}
          </View>
          {!isStreak && (
            <View style={styles.halfField}>
              <Text style={styles.label}>{t('goals.form.unit')}</Text>
              <TextInput
                style={styles.input}
                value={unit}
                onChangeText={setUnit}
                placeholder={t('goals.form.unitPlaceholder')}
                placeholderTextColor={colors.textMuted}
                maxLength={50}
              />
              {fieldErrors.unit && (
                <Text style={styles.fieldError} accessibilityRole="alert">{fieldErrors.unit}</Text>
              )}
            </View>
          )}
        </View>

        {/* Description (optional) */}
        <View>
          <Text style={styles.label}>
            {t('goals.form.description')}
            <Text style={styles.labelOptional}>
              {' '}({t('goals.form.descriptionOptional')})
            </Text>
          </Text>
          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            placeholder={isStreak ? t('goals.form.streakDescriptionPlaceholder') : t('goals.form.descriptionPlaceholder')}
            placeholderTextColor={colors.textMuted}
            maxLength={MAX_GOAL_DESCRIPTION_LENGTH}
          />
          {fieldErrors.description && (
            <Text style={styles.fieldError} accessibilityRole="alert">{fieldErrors.description}</Text>
          )}
        </View>

        {/* Deadline */}
        <View>
          <Text style={styles.label}>
            {t('goals.form.deadline')}
            <Text style={styles.labelOptional}>
              {' '}({t('goals.form.deadlineOptional')})
            </Text>
          </Text>

          {deadline ? (
            <View>
              <View style={styles.deadlineRow}>
                <View style={styles.deadlinePicker}>
                  <AppDatePicker
                    value={deadline}
                    onChange={setDeadline}
                  />
                </View>
                <TouchableOpacity
                  style={styles.removeDeadlineButton}
                  onPress={() => setDeadline('')}
                  activeOpacity={0.7}
                >
                  <X size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              {deadline && isGoalDeadlinePast(deadline) && (
                <Text style={styles.warningText}>
                  {t('goals.form.deadlineInPast')}
                </Text>
              )}
            </View>
          ) : (
            <TouchableOpacity
              style={styles.addDeadlineButton}
              onPress={() => setDeadline(formatAPIDate(new Date()))}
              activeOpacity={0.7}
            >
              <Plus size={14} color={colors.primary} />
              <Text style={styles.addDeadlineText}>
                {t('goals.form.addDeadline')}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            isStreak && styles.submitButtonStreak,
            isSubmitting && styles.submitDisabled,
          ]}
          onPress={onSubmit}
          disabled={isSubmitting}
          activeOpacity={0.8}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.submitText}>{t('goals.create')}</Text>
          )}
        </TouchableOpacity>
      </BottomSheetScrollView>
    </BottomSheetModal>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: AppColors, bottomInset: number) {
  const orange400 = colors.orange400 ?? '#fb923c'
  const orange500 = colors.orange500 ?? '#f97316'

  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    form: {
      paddingTop: 12,
      paddingHorizontal: 24,
      paddingBottom: Math.max(bottomInset, 16) + 24,
      gap: 20,
    },
    row: {
      flexDirection: 'row',
      gap: 16,
    },
    halfField: {
      flex: 1,
    },
    fullField: {
      flex: 1,
    },
    label: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 10,
    },
    labelOptional: {
      fontWeight: '400',
      color: colors.textMuted,
      textTransform: 'none',
      letterSpacing: 0,
    },
    input: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: goalRadius.lg,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 14,
      color: colors.textPrimary,
      minHeight: 56,
    },
    fieldError: {
      fontSize: 12,
      color: colors.red400,
      marginTop: 4,
    },
    // Type cards
    typeCardsRow: {
      flexDirection: 'row',
      gap: 12,
    },
    typeCard: {
      flex: 1,
      padding: 16,
      borderRadius: goalRadius.xl,
      borderWidth: 2,
      borderColor: colors.borderMuted,
      backgroundColor: `${colors.surfaceElevated}80`,
    },
    typeCardSelectedStandard: {
      borderColor: colors.primary,
      backgroundColor: `${colors.primary}14`,
    },
    typeCardSelectedStreak: {
      borderColor: orange500,
      backgroundColor: `${orange500}14`,
    },
    typeCardIcon: {
      width: 36,
      height: 36,
      borderRadius: goalRadius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    typeCardIconDefault: {
      backgroundColor: colors.surfaceElevated,
    },
    typeCardIconSelectedStandard: {
      backgroundColor: `${colors.primary}26`,
    },
    typeCardIconSelectedStreak: {
      backgroundColor: `${orange500}26`,
    },
    typeCardTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textSecondary,
      marginBottom: 2,
    },
    typeCardTitleSelected: {
      color: colors.textPrimary,
    },
    typeCardDescription: {
      fontSize: 11,
      color: colors.textMuted,
      lineHeight: 15,
    },
    typeCardExample: {
      fontSize: 10,
      color: `${colors.textMuted}99`,
      fontStyle: 'italic',
      lineHeight: 14,
      marginTop: 6,
    },
    // Streak hints
    streakHints: {
      gap: 8,
    },
    streakHintGood: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: goalRadius.lg,
      backgroundColor: '#22c55e14',
      borderWidth: 1,
      borderColor: '#22c55e26',
    },
    streakHintBad: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: goalRadius.lg,
      backgroundColor: '#ef444414',
      borderWidth: 1,
      borderColor: '#ef444426',
    },
    streakHintIcon: {
      fontSize: 12,
      marginTop: 1,
      color: colors.textMuted,
    },
    streakHintGoodText: {
      flex: 1,
      fontSize: 11,
      color: '#86efacE6',
      lineHeight: 16,
    },
    streakHintBadText: {
      flex: 1,
      fontSize: 11,
      color: '#fca5a5E6',
      lineHeight: 16,
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
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    warningText: {
      fontSize: 12,
      color: colors.amber400,
      fontWeight: '500',
      marginTop: 8,
    },
    addDeadlineButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 10,
    },
    addDeadlineText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },
    submitButton: {
      marginTop: 4,
      backgroundColor: colors.primary,
      borderRadius: goalRadius.xl,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.2,
      shadowRadius: 20,
      elevation: 8,
    },
    submitButtonStreak: {
      backgroundColor: orange500,
      shadowColor: orange500,
    },
    submitDisabled: {
      opacity: 0.5,
    },
    submitText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.white,
    },
  })
}
