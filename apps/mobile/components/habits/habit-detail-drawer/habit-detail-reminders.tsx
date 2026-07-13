import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

interface HabitDetailRemindersProps {
  habit: NormalizedHabit
  displayTime: (time: string) => string
}

export function HabitDetailReminders({
  habit,
  displayTime,
}: Readonly<HabitDetailRemindersProps>) {
  const { t } = useTranslation()
  const hasScheduledReminders = habit.scheduledReminders.length > 0
  if (!habit.dueTime && !hasScheduledReminders) return null
  return (
    <View>
      <SectionLabel top={8} bottom={0}>
        {t('habits.detail.reminders')}
      </SectionLabel>
      {habit.dueTime ? (
        <SettingsRow
          label={t('habits.form.dueTime')}
          value={displayTime(habit.dueTime)}
          mono
          accessory="none"
        />
      ) : null}
      {habit.scheduledReminders.map((sr, idx) => (
        // react-doctor-disable-next-line no-array-index-as-key -- scheduled reminders are value objects with no id; a read-only detail list that never reorders, so the positional key is stable https://github.com/thomasluizon/orbit-ui-mobile/issues/243
        <SettingsRow
          key={`${sr.when}-${sr.time}-${idx}`}
          label={
            sr.when === 'day_before'
              ? t('habits.form.scheduledReminderDayBefore')
              : t('habits.form.scheduledReminderSameDay')
          }
          value={displayTime(sr.time)}
          mono
          accessory="none"
        />
      ))}
    </View>
  )
}
