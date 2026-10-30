import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useHabitFormInteraction } from './habit-form-interaction'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import type { RepeatReminderOptions } from '@orbit/shared/types/habit'
import { REPEAT_REMINDER_INTERVALS, repeatReminderClock, repeatReminderInstant } from '@orbit/shared/utils/repeat-reminders'
import { getAccountDateTime, toTime24 } from '@orbit/shared/utils'
import { Select } from '@/components/ui/select'
import { TimeField } from '@/components/ui/time-field'
import { ListRow } from '@/components/ui/list-row'
import { useReminderPermission } from '@/hooks/use-reminder-permission'
import { ReminderPermissionNotice } from './reminder-permission-notice'

interface RepeatReminderSectionProps {
  value: RepeatReminderOptions | null | undefined
  enabled: boolean
  general: boolean
  timeZone?: string | null
  onChange: (value: RepeatReminderOptions | null) => void
  onToggle: () => void
}

export function RepeatReminderSection({ value, enabled, general, timeZone, onChange, onToggle }: Readonly<RepeatReminderSectionProps>) {
  const { t } = useTranslation()
  const { disabled, guard } = useHabitFormInteraction()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const permission = useReminderPermission(enabled, onToggle)
  const start = value?.startAtUtc ?? new Date().toISOString()
  const allDay = value?.activeStart == null && value?.activeEnd == null
  const change = (next: RepeatReminderOptions | null) => onChange(next)
  const options = REPEAT_REMINDER_INTERVALS.map((minutes) => ({ value: String(minutes), label: minutes < 60 ? t('habits.form.repeatMinutes', { count: minutes }) : t('habits.form.repeatHours', { count: minutes / 60 }) }))
  return (
    <View style={{ gap: 12 }}>
      <Select label={t('habits.form.reminderKind')} value={value ? 'repeat' : 'other'} options={[{ value: 'other', label: t(general ? 'habits.form.noReminders' : 'habits.form.otherReminders') }, { value: 'repeat', label: t('habits.form.repeatEvery') }]} onChange={guard((kind) => { change(kind === 'repeat' ? { intervalMinutes: 30, startAtUtc: new Date().toISOString() } : null); if (kind === 'repeat' && !enabled) permission.toggleReminder() })} disabled={disabled} />
      {value ? <View style={{ gap: 12 }}>
        <ListRow placement="column" title={t('habits.form.reminder')} toggle={{ checked: enabled, onChange: guard(permission.toggleReminder) }} />
        <ReminderPermissionNotice visible={permission.showNotice} tokens={tokens} onPress={permission.openSettings} />
        {enabled ? <View style={{ gap: 12 }}>
          <Select label={t('habits.form.repeatEvery')} value={String(value.intervalMinutes)} options={options} onChange={guard((interval) => change({ ...value, intervalMinutes: Number(interval) }))} disabled={disabled} />
          <TimeField label={t('habits.form.repeatStart')} value={toTime24(repeatReminderClock(start, timeZone))} onChange={guard((clock) => { const instant = repeatReminderInstant(getAccountDateTime(new Date(start), timeZone).date, clock, timeZone); if (instant) change({ ...value, startAtUtc: instant }) })} disabled={disabled} />
          <ListRow placement="column" title={t('habits.form.repeatAllDay')} toggle={{ checked: allDay, onChange: guard((checked) => change({ ...value, activeStart: checked ? null : '', activeEnd: checked ? null : '' })) }} />
          {!allDay ? <View style={{ gap: 12 }}>
            <TimeField label={t('habits.form.repeatActiveStart')} value={toTime24(value.activeStart?.slice(0, 5) ?? '')} onChange={guard((activeStart) => change({ ...value, activeStart }))} disabled={disabled} />
            <TimeField label={t('habits.form.repeatActiveEnd')} value={toTime24(value.activeEnd?.slice(0, 5) ?? '')} onChange={guard((activeEnd) => change({ ...value, activeEnd }))} disabled={disabled} />
          </View> : null}
        </View> : null}
      </View> : null}
    </View>
  )
}
