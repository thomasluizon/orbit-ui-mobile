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
  return (
    <>
      {habit.dueTime && (
        <SettingsRow
          label={t('habits.form.dueTime')}
          value={displayTime(habit.dueTime)}
          mono
          accessory="none"
        />
      )}

      {habit.scheduledReminders && habit.scheduledReminders.length > 0 && (
        <>
          <SectionLabel>{t('habits.detail.reminders')}</SectionLabel>
          {habit.scheduledReminders.map((sr, idx) => (
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
        </>
      )}
    </>
  )
}
