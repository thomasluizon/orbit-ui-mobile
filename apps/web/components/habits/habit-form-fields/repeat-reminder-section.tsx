'use client'

import { useTranslations } from 'next-intl'
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
  const t = useTranslations()
  const permission = useReminderPermission(enabled, onToggle)
  const start = value?.startAtUtc ?? new Date().toISOString()
  const allDay = value?.activeStart == null && value?.activeEnd == null
  const change = (next: RepeatReminderOptions | null) => onChange(next)
  const options = REPEAT_REMINDER_INTERVALS.map((minutes) => ({ value: String(minutes), label: minutes < 60 ? t('habits.form.repeatMinutes', { count: minutes }) : t('habits.form.repeatHours', { count: minutes / 60 }) }))
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Select label={t('habits.form.reminderKind')} value={value ? 'repeat' : 'other'} options={[{ value: 'other', label: t(general ? 'habits.form.noReminders' : 'habits.form.otherReminders') }, { value: 'repeat', label: t('habits.form.repeatEvery') }]} onChange={(kind) => { change(kind === 'repeat' ? { intervalMinutes: 30, startAtUtc: new Date().toISOString() } : null); if (kind === 'repeat' && !enabled) permission.toggleReminder() }} />
      {value ? <div className="flex min-w-0 flex-col gap-3">
        <ListRow placement="column" title={t('habits.form.reminder')} toggle={{ checked: enabled, onChange: permission.toggleReminder }} />
        <ReminderPermissionNotice visible={permission.showNotice} t={t} />
        {enabled ? <div className="flex min-w-0 flex-col gap-3">
          <Select label={t('habits.form.repeatEvery')} value={String(value.intervalMinutes)} options={options} onChange={(interval) => change({ ...value, intervalMinutes: Number(interval) })} />
          <TimeField label={t('habits.form.repeatStart')} value={toTime24(repeatReminderClock(start, timeZone))} onChange={(clock) => { const instant = repeatReminderInstant(getAccountDateTime(new Date(start), timeZone).date, clock, timeZone); if (instant) change({ ...value, startAtUtc: instant }) }} />
          <ListRow placement="column" title={t('habits.form.repeatAllDay')} toggle={{ checked: allDay, onChange: (checked) => change({ ...value, activeStart: checked ? null : '', activeEnd: checked ? null : '' }) }} />
          {!allDay ? <div className="flex min-w-0 flex-col gap-3">
            <TimeField label={t('habits.form.repeatActiveStart')} value={toTime24(value.activeStart?.slice(0, 5) ?? '')} onChange={(activeStart) => change({ ...value, activeStart })} />
            <TimeField label={t('habits.form.repeatActiveEnd')} value={toTime24(value.activeEnd?.slice(0, 5) ?? '')} onChange={(activeEnd) => change({ ...value, activeEnd })} />
          </div> : null}
        </div> : null}
      </div> : null}
    </div>
  )
}
