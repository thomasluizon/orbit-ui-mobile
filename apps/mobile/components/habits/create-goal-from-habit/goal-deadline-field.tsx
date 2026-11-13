import { ListRow } from '@/components/ui/list-row'
import { Text, View } from 'react-native'
import { MotionPressable as Pressable } from '@/components/ui/motion-pressable'
import { X } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import { DateField } from '@/components/ui/date-field'
import { formatAPIDate } from '@orbit/shared/utils/dates'
import { isGoalDeadlinePast } from '@orbit/shared/utils/goal-form'
import type { CreateGoalStyles, CreateGoalTokens } from './styles'

interface GoalDeadlineFieldProps {
  tokens: CreateGoalTokens
  styles: CreateGoalStyles
  deadline: string
  onChangeDeadline: (value: string) => void
}

export function GoalDeadlineField({
  tokens,
  styles,
  deadline,
  onChangeDeadline,
}: Readonly<GoalDeadlineFieldProps>) {
  const { t } = useTranslation()
  return (
    <View>
      <Text style={styles.fieldLabel}>
        {t('goals.form.deadlineQuestion')}{' '}
        <Text style={styles.labelOptional}>
          ({t('goals.form.deadlineOptional')})
        </Text>
      </Text>
      {deadline ? (
        <View>
          <View style={styles.deadlineRow}>
            <View style={styles.deadlinePicker}>
              <DateField value={deadline} onChange={onChangeDeadline} />
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.removeDeadlineButton,
                pressed && { backgroundColor: tokens.bgHover },
              ]}
              onPress={() => onChangeDeadline('')}
              accessibilityRole="button"
              accessibilityLabel={t('goals.form.removeDeadline')}
            >
              <X size={16} color={tokens.fg3} strokeWidth={1.8} />
            </Pressable>
          </View>
          {isGoalDeadlinePast(deadline) ? (
            <Text style={styles.warningText}>
              {t('goals.form.deadlineInPast')}
            </Text>
          ) : null}
        </View>
      ) : (
        <View><ListRow placement="field" icon="plus" title={t('goals.form.addDeadline')} onClick={() => onChangeDeadline(formatAPIDate(new Date()))} /></View>
      )}
    </View>
  )
}
