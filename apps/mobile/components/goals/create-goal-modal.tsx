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
import { Plus, X } from 'lucide-react-native'
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
  red400: string
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

  const isSubmitting = createGoal.isPending
  const isStreak = isStreakGoal(goalType)

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
        {/* Goal Type Toggle */}
        <View>
          <Text style={styles.label}>{t('goals.form.type')}</Text>
          <View style={styles.typeToggle}>
            <TouchableOpacity
              style={[
                styles.typeButton,
                goalType === 'Standard' && styles.typeButtonSelected,
              ]}
              onPress={() => handleTypeChange('Standard')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.typeButtonText,
                  goalType === 'Standard' && styles.typeButtonTextSelected,
                ]}
              >
                {t('goals.form.typeStandard')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.typeButton,
                goalType === 'Streak' && styles.typeButtonSelected,
              ]}
              onPress={() => handleTypeChange('Streak')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.typeButtonText,
                  goalType === 'Streak' && styles.typeButtonTextSelected,
                ]}
              >
                {t('goals.form.typeStreak')}
              </Text>
            </TouchableOpacity>
          </View>
          {isStreak && (
            <Text style={styles.typeDescription}>
              {t('goals.form.typeStreakDescription')}
            </Text>
          )}
        </View>

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
            maxLength={200}
          />
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
  // Type toggle
  typeToggle: {
    flexDirection: 'row',
    gap: 8,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: goalRadius.lg,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  typeButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  typeButtonTextSelected: {
    color: colors.white,
  },
  typeDescription: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 8,
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
