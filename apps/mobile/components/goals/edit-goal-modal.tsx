import { useState, useCallback, useEffect, useMemo } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { Plus, X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { AppDatePicker } from '@/components/ui/app-date-picker'
import { useAppToast } from '@/hooks/use-app-toast'
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
import { useAppTheme } from '@/lib/use-app-theme'
import { MAX_GOAL_DESCRIPTION_LENGTH } from '@orbit/shared/validation'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

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

type AppColors = {
  primary: string
  white: string
  textPrimary: string
  textMuted: string
  textSecondary: string
  surfaceElevated: string
  borderMuted: string
  amber400: string
  red400: string
}
const goalRadius = {
  lg: 16,
  xl: 20,
} as const

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EditGoalModal({ open, onClose, goal }: EditGoalModalProps) {
  const { t } = useTranslation()
  const translate = useCallback(
    (key: string, values?: Record<string, unknown>) => t(key, values),
    [t],
  )
  const { colors } = useAppTheme()
  const insets = useSafeAreaInsets()
  const updateGoal = useUpdateGoal()
  const { showError } = useAppToast()
  const styles = useMemo(() => createStyles(colors, insets.bottom), [colors, insets.bottom])

  const isStreak = isStreakGoal(goal.type)

  // Form state
  const [description, setDescription] = useState('')
  const [targetValue, setTargetValue] = useState('')
  const [unit, setUnit] = useState('')
  const [deadline, setDeadline] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const isSubmitting = updateGoal.isPending

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

  // Load goal data when modal opens
  useEffect(() => {
    if (open) {
      setDescription(goal.title)
      setTargetValue(String(goal.targetValue))
      setUnit(goal.unit)
      setDeadline(goal.deadline ?? '')
      setSubmitted(false)
    }
  }, [open, goal])

  function validate(): string | null {
    return translateErrorKey(
      translate,
      validateGoalDraftInput(description, targetValue, unit),
    )
  }

  function buildTitle(): string {
    return buildGoalTitle(description, targetValue, unit)
  }

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
      const request: UpdateGoalRequest = {
        title,
        targetValue: numVal,
        unit: unit.trim(),
        deadline: deadline || null,
      }

      await updateGoal.mutateAsync({ goalId: goal.id, data: request })
      onClose()
    } catch (error) {
      showError(getFriendlyErrorMessage(error, translate, 'goals.errors.update', 'goal'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, description, goal.id, onClose, showError, targetValue, translate, unit, updateGoal])

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  return (
    <BottomSheetModal
      open={open}
      onClose={handleClose}
      title={t('goals.detail.edit')}
      snapPoints={['70%', '90%']}
    >
      <BottomSheetScrollView
        style={styles.scroll}
        contentContainerStyle={styles.form}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Streak type badge (read-only) */}
        {isStreak && (
          <View style={styles.streakBadgeRow}>
            <View style={styles.streakBadge}>
              <Text style={styles.streakBadgeText}>
                {t('goals.form.typeStreak')}
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
            placeholder={t('goals.form.descriptionPlaceholder')}
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
          style={[styles.submitButton, isSubmitting && styles.submitDisabled]}
          onPress={onSubmit}
          disabled={isSubmitting}
          activeOpacity={0.8}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.submitText}>{t('common.save')}</Text>
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
  return StyleSheet.create({
  scroll: {
    flex: 1,
  },
  form: {
    paddingTop: 12,
    paddingHorizontal: 24,
    paddingBottom: Math.max(bottomInset, 16) + 24,
    gap: 24,
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
  // Streak type badge
  streakBadgeRow: {
    flexDirection: 'row',
  },
  streakBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 9999,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  streakBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.amber400,
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
