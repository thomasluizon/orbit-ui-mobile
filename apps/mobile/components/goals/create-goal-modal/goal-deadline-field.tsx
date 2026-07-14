import { Pressable, Text, View } from 'react-native'
import { Plus, X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { AppDatePicker } from '@/components/ui/app-date-picker'
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
        {t('goals.form.deadline')}{' '}
        <Text style={styles.labelOptional}>
          ({t('goals.form.deadlineOptional')})
        </Text>
      </Text>
      {deadline ? (
        <View>
          <View style={styles.deadlineRow}>
            <View style={styles.deadlinePicker}>
              <AppDatePicker value={deadline} onChange={onChangeDeadline} />
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.removeDeadlineButton,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => onChangeDeadline('')}
              accessibilityRole="button"
              accessibilityLabel={t('goals.form.removeDeadline')}
            >
              <X size={16} color={tokens.fg4} strokeWidth={1.8} />
            </Pressable>
          </View>
          {isGoalDeadlinePast(deadline) ? (
            <Text style={styles.warningText}>
              {t('goals.form.deadlineInPast')}
            </Text>
          ) : null}
        </View>
      ) : (
        <Pressable
          style={({ pressed }) => [
            styles.addDeadlineButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => onChangeDeadline(formatAPIDate(new Date()))}
          hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('goals.form.addDeadline')}
        >
          <Plus size={14} color={tokens.fg1} strokeWidth={1.8} />
          <Text style={styles.addDeadlineText}>
            {t('goals.form.addDeadline')}
          </Text>
        </Pressable>
      )}
    </View>
  )
}
