import type { Ref } from 'react'
import { Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { MAX_GOAL_UNIT_LENGTH } from '@orbit/shared/validation'
import type { EditGoalStyles } from './styles'

interface EditGoalTargetFieldsProps {
  styles: EditGoalStyles
  isStreak: boolean
  targetValue: string
  unit: string
  fieldErrors: Record<string, string>
  targetRef: Ref<TextInput>
  unitRef: Ref<TextInput>
  onChangeTarget: (value: string) => void
  onChangeUnit: (value: string) => void
}

export function EditGoalTargetFields({
  styles,
  isStreak,
  targetValue,
  unit,
  fieldErrors,
  targetRef,
  unitRef,
  onChangeTarget,
  onChangeUnit,
}: Readonly<EditGoalTargetFieldsProps>) {
  const { t } = useTranslation()
  return (
    <View style={styles.row}>
      <View style={isStreak ? styles.fullField : styles.halfField}>
        <Text nativeID="edit-goal-target-label" style={styles.fieldLabel}>
          {isStreak
            ? t('goals.form.streakTarget')
            : t('goals.form.targetValue')}
        </Text>
        <BottomSheetAppTextInput
          ref={targetRef}
          value={targetValue}
          onChangeText={onChangeTarget}
          keyboardType="decimal-pad"
          accessibilityLabel={
            isStreak
              ? t('goals.form.streakTarget')
              : t('goals.form.targetValue')
          }
          accessibilityLabelledBy="edit-goal-target-label"
          accessibilityHint={[t('common.required'), fieldErrors.targetValue].filter(Boolean).join('. ')}
        />
        {fieldErrors.targetValue ? (
          <Text nativeID="edit-goal-target-error" style={styles.fieldError} accessibilityRole="alert">
            {fieldErrors.targetValue}
          </Text>
        ) : null}
      </View>
      {!isStreak ? (
        <View style={styles.halfField}>
          <Text nativeID="edit-goal-unit-label" style={styles.fieldLabel}>{t('goals.form.unit')}</Text>
          <BottomSheetAppTextInput
            ref={unitRef}
            value={unit}
            onChangeText={onChangeUnit}
            maxLength={MAX_GOAL_UNIT_LENGTH}
            accessibilityLabel={t('goals.form.unit')}
            accessibilityLabelledBy="edit-goal-unit-label"
            accessibilityHint={[t('common.required'), fieldErrors.unit].filter(Boolean).join('. ')}
          />
          {fieldErrors.unit ? (
            <Text nativeID="edit-goal-unit-error" style={styles.fieldError} accessibilityRole="alert">
              {fieldErrors.unit}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}
