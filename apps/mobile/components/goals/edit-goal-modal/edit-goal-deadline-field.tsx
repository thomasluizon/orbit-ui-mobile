import { Text, TouchableOpacity, View } from 'react-native'
import { Plus, X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { AppDatePicker } from '@/components/ui/app-date-picker'
import { formatAPIDate } from '@orbit/shared/utils/dates'
import { isGoalDeadlinePast } from '@orbit/shared/utils/goal-form'
import type { EditGoalStyles, EditGoalTokens } from './styles'

interface EditGoalDeadlineFieldProps {
  tokens: EditGoalTokens
  styles: EditGoalStyles
  deadline: string
  onChangeDeadline: (value: string) => void
}

export function EditGoalDeadlineField({
  tokens,
  styles,
  deadline,
  onChangeDeadline,
}: Readonly<EditGoalDeadlineFieldProps>) {
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
            <TouchableOpacity
              style={styles.removeDeadlineButton}
              onPress={() => onChangeDeadline('')}
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
          onPress={() => onChangeDeadline(formatAPIDate(new Date()))}
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
  )
}
