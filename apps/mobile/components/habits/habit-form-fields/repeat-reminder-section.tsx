import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View, Text } from 'react-native'
import { useHabitFormInteraction } from './habit-form-interaction'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import type { RepeatReminderOptions } from '@orbit/shared/types/habit'
import { REPEAT_REMINDER_INTERVALS, repeatReminderClock, repeatReminderInstant, startRepeatReminder } from '@orbit/shared/utils/repeat-reminders'
import { getAccountDateTime, toTime24 } from '@orbit/shared/utils'
import { RadioGroup } from '@/components/ui/radio-group'
import { RadioRow } from '@/components/ui/select-check'
import { Select } from '@/components/ui/select'
import { TimeField } from '@/components/ui/time-field'
import { ListRow } from '@/components/ui/list-row'
import { useReminderPermission } from '@/hooks/use-reminder-permission'
import { ReminderPermissionNotice } from './reminder-permission-notice'

interface RepeatReminderSectionProps {
  children?: ReactNode
  value: RepeatReminderOptions | null | undefined
  enabled: boolean
  general: boolean
  timeZone?: string | null
  onChange: (value: RepeatReminderOptions | null) => void
  onToggle: () => void
}

interface RepeatReminderFieldsProps {
  value: RepeatReminderOptions
  timeZone?: string | null
  onChange: (value: RepeatReminderOptions) => void
}

/** The editor of a repeat reminder: the interval, the start, and the active hours. */
export function RepeatReminderFields({ value, timeZone, onChange }: Readonly<RepeatReminderFieldsProps>) {
  const { t } = useTranslation()
  const { disabled, guard } = useHabitFormInteraction()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const start = value.startAtUtc ?? new Date().toISOString()
  const allDay = value.activeStart == null && value.activeEnd == null
  const options = REPEAT_REMINDER_INTERVALS.map((minutes) => ({ value: String(minutes), label: minutes < 60 ? t('habits.form.repeatMinutes', { count: minutes }) : t('habits.form.repeatHours', { count: minutes / 60 }) }))
  return (
    <View style={{ gap: 24 }}>
      <View style={{ gap: 8 }}><Text style={{ color: tokens.fg2, fontSize: 14, fontFamily: 'Geist_500Medium' }}>{t('habits.form.repeatInterval')}</Text><Select label={t('habits.form.repeatInterval')} value={String(value.intervalMinutes)} options={options} onChange={guard((interval) => onChange({ ...value, intervalMinutes: Number(interval) }))} disabled={disabled} /></View>
      <TimeField label={t('habits.form.repeatStart')} value={toTime24(repeatReminderClock(start, timeZone))} onChange={guard((clock) => { const instant = repeatReminderInstant(getAccountDateTime(new Date(start), timeZone).date, clock, timeZone); if (instant) onChange({ ...value, startAtUtc: instant }) })} disabled={disabled} />
      <View testID="timing-row"><ListRow disabled={disabled} placement="field" title={t('habits.form.repeatAllDay')} toggle={{ checked: allDay, onChange: guard((checked) => onChange({ ...value, activeStart: checked ? null : '', activeEnd: checked ? null : '' })) }} /></View>
      {!allDay ? <View style={{ gap: 12 }}>
        <TimeField label={t('habits.form.repeatActiveStart')} value={toTime24(value.activeStart?.slice(0, 5) ?? '')} onChange={guard((activeStart) => onChange({ ...value, activeStart }))} disabled={disabled} />
        <TimeField label={t('habits.form.repeatActiveEnd')} value={toTime24(value.activeEnd?.slice(0, 5) ?? '')} onChange={guard((activeEnd) => onChange({ ...value, activeEnd }))} disabled={disabled} />
      </View> : null}
    </View>
  )
}

export function RepeatReminderSection({ value, enabled, general, timeZone, onChange, onToggle, children }: Readonly<RepeatReminderSectionProps>) {
  const { t } = useTranslation()
  const { disabled, guard } = useHabitFormInteraction()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const availability = disabled ? { disabled: true as const, reasonScope: 'group' as const } : { disabled: false as const }
  const permission = useReminderPermission(enabled, onToggle)
  return (
    <View style={{ gap: 24 }}>
      <View testID="timing-row"><ListRow disabled={disabled} placement="field" title={t('habits.form.reminder')} toggle={{ checked: enabled, onChange: guard(() => { if (!enabled && general && !value) onChange(startRepeatReminder()); permission.toggleReminder() }) }} /></View>
      <ReminderPermissionNotice visible={permission.showNotice} tokens={tokens} onPress={permission.openSettings} />
      {enabled ? <View style={{ gap: 24 }}>
        <View style={{ gap: 12 }}><Text accessibilityRole="header" style={{ color: tokens.fg1, fontSize: 16, fontFamily: 'Geist_500Medium' }}>{t('habits.form.reminderKind')}</Text><RadioGroup accessibilityLabel={t('habits.form.reminderKind')}>
          {!general ? <RadioRow label={t('habits.form.definedTimes')} selected={!value} {...availability} onSelect={guard(() => onChange(null))} /> : null}
          <RadioRow label={t('habits.form.repeatEvery')} selected={Boolean(value)} {...availability} onSelect={guard(() => { if (!value) onChange(startRepeatReminder()) })} />
        </RadioGroup></View>
        {!value ? children : null}
        {value ? <RepeatReminderFields value={value} timeZone={timeZone} onChange={onChange} /> : null}
      </View> : null}
    </View>
  )
}
