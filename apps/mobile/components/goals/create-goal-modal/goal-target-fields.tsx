import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { MAX_GOAL_UNIT_LENGTH } from '@orbit/shared/validation'
import type { CreateGoalStyles, CreateGoalTokens } from './styles'

interface GoalTargetFieldsProps {
  tokens: CreateGoalTokens
  styles: CreateGoalStyles
  isStreak: boolean
  targetValue: string
  unit: string
  fieldErrors: Record<string, string>
  onChangeTarget: (value: string) => void
  onChangeUnit: (value: string) => void
}

export function GoalTargetFields({
  tokens,
  styles,
  isStreak,
  targetValue,
  unit,
  fieldErrors,
  onChangeTarget,
  onChangeUnit,
}: Readonly<GoalTargetFieldsProps>) {
  const { t } = useTranslation()
  return (
    <View style={styles.row}>
      <View style={isStreak ? styles.fullField : styles.halfField}>
        <Text style={styles.fieldLabel}>
          {isStreak
            ? t('goals.form.streakTarget')
            : t('goals.form.targetValue')}
        </Text>
        <BottomSheetAppTextInput
          value={targetValue}
          onChangeText={onChangeTarget}
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
            onChangeText={onChangeUnit}
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
  )
}
