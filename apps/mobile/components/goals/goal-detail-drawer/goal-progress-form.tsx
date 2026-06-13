import { ActivityIndicator, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { PillButton } from '@/components/ui/pill-button'
import type { AppTokens, createStyles } from './styles'

type GoalDetailStyles = ReturnType<typeof createStyles>

interface GoalProgressFormProps {
  isStreak: boolean
  progressValue: string
  onChangeValue: (value: string) => void
  progressNote: string
  onChangeNote: (value: string) => void
  progressExceedsTarget: boolean
  isUpdatingProgress: boolean
  onCancel: () => void
  onSubmit: () => void
  styles: GoalDetailStyles
  tokens: AppTokens
}

export function GoalProgressForm({
  isStreak,
  progressValue,
  onChangeValue,
  progressNote,
  onChangeNote,
  progressExceedsTarget,
  isUpdatingProgress,
  onCancel,
  onSubmit,
  styles,
  tokens,
}: Readonly<GoalProgressFormProps>) {
  const { t } = useTranslation()
  const targetLabel = isStreak
    ? t('goals.form.streakTarget')
    : t('goals.form.targetValue')

  return (
    <View style={styles.progressForm}>
      <View>
        <Text style={styles.formLabel}>{targetLabel}</Text>
        <BottomSheetAppTextInput
          value={progressValue}
          onChangeText={onChangeValue}
          keyboardType="decimal-pad"
          accessibilityLabel={targetLabel}
          accessibilityHint={t('goals.updateProgress')}
        />
        {progressExceedsTarget ? (
          <Text style={styles.warningText}>
            {t('goals.form.progressExceedsTarget')}
          </Text>
        ) : null}
      </View>
      <View>
        <Text style={styles.formLabel}>{t('goals.progressNote')}</Text>
        <BottomSheetAppTextInput
          value={progressNote}
          onChangeText={onChangeNote}
          placeholder={t('goals.progressNote')}
          placeholderTextColor={tokens.fg3}
          accessibilityLabel={t('goals.progressNote')}
          accessibilityHint={t('goals.updateProgress')}
        />
      </View>
      <View style={styles.progressFormActions}>
        <PillButton
          variant="ghost"
          style={styles.progressFormButton}
          onPress={onCancel}
          accessibilityLabel={t('common.cancel')}
        >
          {t('common.cancel')}
        </PillButton>
        <PillButton
          style={styles.progressFormButton}
          onPress={onSubmit}
          disabled={!progressValue || isUpdatingProgress}
          accessibilityLabel={t('common.save')}
        >
          {isUpdatingProgress ? (
            <ActivityIndicator size="small" color={tokens.fgOnPrimary} />
          ) : (
            t('common.save')
          )}
        </PillButton>
      </View>
    </View>
  )
}
