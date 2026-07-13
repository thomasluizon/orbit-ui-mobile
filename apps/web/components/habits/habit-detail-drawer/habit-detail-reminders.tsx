'use client'

import { useTranslations } from 'next-intl'
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
  const t = useTranslations()
  const hasScheduledReminders = habit.scheduledReminders.length > 0
  if (!habit.dueTime && !hasScheduledReminders) return null
  return (
    <>
      <SectionLabel>{t('habits.detail.reminders')}</SectionLabel>
      {habit.dueTime && (
        <SettingsRow
          label={t('habits.form.dueTime')}
          value={displayTime(habit.dueTime)}
          mono
          accessory="none"
        />
      )}
      {habit.scheduledReminders.map((sr, idx) => (
        <SettingsRow
          // react-doctor-disable-next-line no-array-index-as-key -- read-only display of the habit's fixed-order scheduled reminders (no reorder/filter); ScheduledReminderTime has no id, so the index disambiguates the composite when/time key https://github.com/thomasluizon/orbit-ui-mobile/issues/243
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
    </>
  )
}
