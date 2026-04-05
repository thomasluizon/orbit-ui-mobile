import { useState, useCallback, useEffect, useMemo } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { Plus, X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { AppDatePicker } from '@/components/ui/app-date-picker'
import { useUpdateGoal } from '@/hooks/use-goals'
import { formatAPIDate } from '@orbit/shared/utils'
import type { Goal, UpdateGoalRequest } from '@orbit/shared/types/goal'
import { colors, radius } from '@/lib/theme'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EditGoalModalProps {
  open: boolean
  onClose: () => void
  goal: Goal
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EditGoalModal({ open, onClose, goal }: EditGoalModalProps) {
  const { t } = useTranslation()
  const updateGoal = useUpdateGoal()

  // Form state
  const [description, setDescription] = useState('')
  const [targetValue, setTargetValue] = useState('')
  const [unit, setUnit] = useState('')
  const [deadline, setDeadline] = useState('')
  const [validationError, setValidationError] = useState('')

  const isSubmitting = updateGoal.isPending

  const deadlineIsPast = useMemo(() => {
    if (!deadline) return false
    return deadline < formatAPIDate(new Date())
  }, [deadline])

  // Load goal data when modal opens
  useEffect(() => {
    if (open) {
      setDescription(goal.title)
      setTargetValue(String(goal.targetValue))
      setUnit(goal.unit)
      setDeadline(goal.deadline ?? '')
      setValidationError('')
    }
  }, [open, goal])

  function validate(): string | null {
    const numVal = Number(targetValue)
    if (!targetValue || numVal <= 0) {
      return t('goals.form.targetValueRequired')
    }
    if (!unit.trim()) {
      return t('goals.form.unitRequired')
    }
    return null
  }

  function buildTitle(): string {
    return description.trim() || `${targetValue} ${unit.trim()}`
  }

  const onSubmit = useCallback(async () => {
    setValidationError('')

    const err = validate()
    if (err) {
      setValidationError(err)
      return
    }

    const numVal = Number(targetValue)
    if (isNaN(numVal)) return

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
    } catch {
      // Error handled by mutation
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetValue, unit, description, deadline, goal.id, updateGoal, onClose])

  const handleClose = useCallback(() => {
    setValidationError('')
    onClose()
  }, [onClose])

  const mutationError = updateGoal.error?.message ?? null

  return (
    <BottomSheetModal
      open={open}
      onClose={handleClose}
      title={t('goals.detail.edit')}
      snapPoints={['70%', '90%']}
    >
      <View style={styles.form}>
        {/* Quantity + Unit */}
        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.label}>{t('goals.form.targetValue')}</Text>
            <TextInput
              style={styles.input}
              value={targetValue}
              onChangeText={setTargetValue}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.halfField}>
            <Text style={styles.label}>{t('goals.form.unit')}</Text>
            <TextInput
              style={styles.input}
              value={unit}
              onChangeText={setUnit}
              maxLength={50}
            />
          </View>
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
              {deadlineIsPast && (
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

        {/* Validation error */}
        {validationError ? (
          <Text style={styles.errorText}>{validationError}</Text>
        ) : null}

        {/* Mutation error */}
        {mutationError ? (
          <Text style={styles.errorText}>{mutationError}</Text>
        ) : null}

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
      </View>
    </BottomSheetModal>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  form: {
    gap: 20,
    paddingBottom: 40,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  labelOptional: {
    fontWeight: '400',
    color: colors.textMuted,
    textTransform: 'none',
    letterSpacing: 0,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
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
    marginTop: 4,
  },
  addDeadlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  addDeadlineText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  errorText: {
    fontSize: 12,
    color: colors.red400,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
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
