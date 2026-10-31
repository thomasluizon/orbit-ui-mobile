import { ListRow } from '@/components/ui/list-row'
import { toTime24 } from '@orbit/shared/utils'

import { useTimeFormat } from '@/hooks/use-time-format'
import { useState } from 'react'
import { X } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import type { ScheduledReminderWhen } from '@orbit/shared/types/habit'
import { MAX_SCHEDULED_REMINDERS, validateScheduledReminders } from '@orbit/shared/validation'
import { TimeField } from '@/components/ui/time-field'
import type { Time24 } from '@orbit/shared/contracts/forms'
import { ReminderPermissionNotice } from './reminder-permission-notice'
import { useReminderPermission } from '@/hooks/use-reminder-permission'
import { RadioGroup, RadioItem } from '@/components/ui/radio-group'

function ReminderWhenOption({ label, selected, onSelect }: Readonly<{ label: string; selected: boolean; onSelect: () => void }>) {
  return (
    <RadioItem selected={selected} onSelect={onSelect}><button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`chip flex-1 justify-center focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--primary)] ${selected ? 'chip-active' : ''}`}
    >{label}</button></RadioItem>
  )
}

interface ScheduledReminderSectionProps {
  hideDayBefore?: boolean
  inline?: boolean
  reminderEnabled: boolean
  scheduledReminders: Array<{ when: ScheduledReminderWhen; time: string }> | undefined
  onToggleReminder: () => void
  onSetScheduledReminders: (reminders: Array<{ when: ScheduledReminderWhen; time: string }>) => void
  onValidationError: (message: string) => void
  /** The timed reminder card owns the switch when this editor is nested inside it. */
  nested?: boolean
  offsetReminderCount?: number
  t: ReturnType<typeof useTranslations>
}

export function ScheduledReminderSection({
  hideDayBefore = false,
  inline = false, reminderEnabled, scheduledReminders,
  onToggleReminder, onSetScheduledReminders, onValidationError, nested = false,
  offsetReminderCount = 0, t,
}: Readonly<ScheduledReminderSectionProps>) {
  const { displayTime } = useTimeFormat()

  const [when, setWhen] = useState<ScheduledReminderWhen>('same_day')

  const permission = useReminderPermission(reminderEnabled, onToggleReminder)

  const atScheduledLimit = (scheduledReminders?.length ?? 0) >= MAX_SCHEDULED_REMINDERS
  const atRelativeLimit = (scheduledReminders?.length ?? 0) + offsetReminderCount >= 15
  const atLimit = atScheduledLimit || atRelativeLimit

  function addScheduledReminder(time: Time24) {
    if (atRelativeLimit) {
      onValidationError(t('habits.form.relativeReminderMax'))
      return
    }
    const current = scheduledReminders ?? []
    const candidate = [...current, { when: hideDayBefore ? 'same_day' as const : when, time }]
    const validationErrorKey = validateScheduledReminders(candidate)
    if (validationErrorKey) {
      onValidationError(t(validationErrorKey))
      return
    }
    onSetScheduledReminders(candidate)

  }

  function removeScheduledReminder(index: number) {
    const current = scheduledReminders ?? []
    onSetScheduledReminders(current.filter((_, i) => i !== index))
  }

  function scheduledReminderLabel(sr: { when: ScheduledReminderWhen; time: string }): string {
    const timeDisplay = displayTime(sr.time)
    if (sr.when === 'day_before') {
      return t('habits.form.scheduledReminderDayBeforeAt', { time: timeDisplay })
    }
    return t('habits.form.scheduledReminderSameDayAt', { time: timeDisplay })
  }

  return (
    <div className={nested ? 'flex flex-col gap-2' : inline ? 'flex flex-col gap-3' : 'flex flex-col gap-3 rounded-[14px] bg-[var(--bg-field)] p-4 shadow-[inset_0_0_0_1px_var(--hairline)]'}>
      {nested ? <p className="m-0 text-xs text-[var(--fg-3)]">{t('habits.form.scheduledReminderFixedTimes')}</p> : null}
      {!nested && <ListRow placement={inline ? "column" : undefined} icon={'bell'} title={t('habits.form.scheduledReminder')} toggle={{ checked: reminderEnabled, onChange: permission.toggleReminder }} />}
      {!nested && <ReminderPermissionNotice visible={permission.showNotice} t={t} />}
      {reminderEnabled && (
        <div className="flex flex-col gap-2">
          {(scheduledReminders?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2">
              {(scheduledReminders ?? []).map((sr, idx) => (
                <span
                  key={`${sr.when}-${sr.time}`}
                  className="inline-flex items-center gap-1 rounded-full bg-[rgba(var(--primary-rgb),0.12)] px-3 py-1 text-[var(--fg-1)]"
                  style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500 }}
                >
                  {scheduledReminderLabel(sr)}
                  <button type="button" aria-label={t('habits.form.removeScheduledReminder')} className="grid place-items-center min-h-[var(--touch-min)] min-w-[var(--touch-min)] hover:text-[var(--fg-2)] transition-colors" onClick={() => removeScheduledReminder(idx)}>
                    <X size={16} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div>
            {atLimit && (
              <p className="text-[14px] text-[var(--fg-3)]">{t(atRelativeLimit ? 'habits.form.relativeReminderMax' : 'habits.form.scheduledReminderMax')}</p>
            )}

            {!atLimit && (
              <div className="flex flex-col gap-2">
                <RadioGroup className="flex gap-2" aria-label={t('habits.form.scheduledReminder')}>
                  {!hideDayBefore ? <ReminderWhenOption label={t('habits.form.scheduledReminderDayBefore')} selected={when === 'day_before'} onSelect={() => setWhen('day_before')} /> : null}
                  <ReminderWhenOption label={t('habits.form.scheduledReminderSameDay')} selected={when === 'same_day'} onSelect={() => setWhen('same_day')} />
                </RadioGroup>

                <div className="flex flex-col gap-2">
                  <TimeField
                    label={t('habits.form.scheduledReminderTime')}
                    placeholder={t('habits.form.scheduledReminderTimePlaceholder')}
                    value={toTime24('')}
                    onChange={addScheduledReminder}
                  />

                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
