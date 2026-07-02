import { useState } from 'react'
import { X, Plus, Bell } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import type { ScheduledReminderWhen } from '@orbit/shared/types/habit'
import { formatLocaleTime } from '@orbit/shared/utils'
import { MAX_SCHEDULED_REMINDERS, validateScheduledReminders } from '@orbit/shared/validation'
import { AppTimePicker } from '@/components/ui/app-time-picker'
import { Switch } from '@/components/ui/settings-row'

interface ScheduledReminderSectionProps {
  reminderEnabled: boolean
  scheduledReminders: Array<{ when: ScheduledReminderWhen; time: string }> | undefined
  onToggleReminder: () => void
  onSetScheduledReminders: (reminders: Array<{ when: ScheduledReminderWhen; time: string }>) => void
  onValidationError: (message: string) => void
  t: ReturnType<typeof useTranslations>
}

export function ScheduledReminderSection({
  reminderEnabled, scheduledReminders,
  onToggleReminder, onSetScheduledReminders, onValidationError, t,
}: Readonly<ScheduledReminderSectionProps>) {
  const locale = useLocale()
  const [showForm, setShowForm] = useState(false)
  const [when, setWhen] = useState<ScheduledReminderWhen>('same_day')
  const [time, setTime] = useState('')

  const atLimit = (scheduledReminders?.length ?? 0) >= MAX_SCHEDULED_REMINDERS

  function addScheduledReminder() {
    if (!time) {
      onValidationError(t('habits.form.invalidScheduledReminderTime'))
      return
    }
    const current = scheduledReminders ?? []
    const candidate = [...current, { when, time }]
    const validationErrorKey = validateScheduledReminders(candidate)
    if (validationErrorKey) {
      onValidationError(t(validationErrorKey as Parameters<typeof t>[0]))
      return
    }
    onSetScheduledReminders(candidate)
    setTime('')
    setShowForm(false)
  }

  function removeScheduledReminder(index: number) {
    const current = scheduledReminders ?? []
    onSetScheduledReminders(current.filter((_, i) => i !== index))
  }

  function scheduledReminderLabel(sr: { when: ScheduledReminderWhen; time: string }): string {
    const timeDisplay = formatLocaleTime(sr.time, locale)
    if (sr.when === 'day_before') {
      return t('habits.form.scheduledReminderDayBeforeAt', { time: timeDisplay })
    }
    return t('habits.form.scheduledReminderSameDayAt', { time: timeDisplay })
  }

  return (
    <div className="space-y-3 rounded-[14px] bg-[var(--bg-field)] p-4 shadow-[inset_0_0_0_1px_var(--hairline)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Bell size={20} strokeWidth={1.8} className="text-[var(--fg-2)]" aria-hidden="true" />
          <span
            className="text-[var(--fg-1)]"
            style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500 }}
          >
            {t('habits.form.scheduledReminder')}
          </span>
        </div>
        <Switch
          on={reminderEnabled}
          onToggle={onToggleReminder}
          ariaLabel={t('habits.form.scheduledReminder')}
        />
      </div>
      {reminderEnabled && (
        <div className="space-y-2">
          {(scheduledReminders?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2">
              {(scheduledReminders ?? []).map((sr, idx) => (
                <span
                  key={`${sr.when}-${sr.time}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(var(--primary-rgb),0.12)] px-3 py-1.5 text-[var(--primary)]"
                  style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500 }}
                >
                  {scheduledReminderLabel(sr)}
                  <button type="button" aria-label={t('habits.form.removeScheduledReminder')} className="grid place-items-center min-h-[44px] min-w-[44px] -my-2.5 -mr-2.5 -ml-1 hover:text-[var(--primary-pressed)] transition-colors" onClick={() => removeScheduledReminder(idx)}>
                    <X size={13} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div>
            {!showForm && !atLimit && (
              <button
                type="button"
                className="chip"
                onClick={() => setShowForm(true)}
              >
                <Plus size={14} strokeWidth={2} aria-hidden="true" />
                {t('habits.form.scheduledReminderAdd')}
              </button>
            )}

            {atLimit && (
              <p className="text-[13px] text-[var(--fg-3)]">{t('habits.form.scheduledReminderMax')}</p>
            )}

            {showForm && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-pressed={when === 'day_before'}
                    className={`chip flex-1 justify-center ${when === 'day_before' ? 'chip-active' : ''}`}
                    onClick={() => setWhen('day_before')}
                  >
                    {t('habits.form.scheduledReminderDayBefore')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={when === 'same_day'}
                    className={`chip flex-1 justify-center ${when === 'same_day' ? 'chip-active' : ''}`}
                    onClick={() => setWhen('same_day')}
                  >
                    {t('habits.form.scheduledReminderSameDay')}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <AppTimePicker
                    value={time}
                    ariaLabel={t('habits.form.scheduledReminderTimePlaceholder')}
                    placeholder={t('habits.form.scheduledReminderTimePlaceholder')}
                    className="flex-1"
                    onChange={setTime}
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded-full bg-[var(--primary)] text-[var(--fg-on-primary)] hover:bg-[var(--primary-pressed)] transition-[background-color,opacity,transform] duration-[var(--dur-fast)] active:scale-[0.96] disabled:opacity-40"
                    style={{
                      padding: '9px 14px',
                      fontFamily: 'var(--font-sans)',
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                    disabled={!time}
                    onClick={addScheduledReminder}
                  >
                    {t('common.add')}
                  </button>
                  <button
                    type="button"
                    aria-label={t('common.cancel')}
                    className="touch-target shrink-0 grid size-10 place-items-center rounded-full text-[var(--fg-3)] hover:text-[var(--fg-1)] transition-colors duration-[var(--dur-fast)]"
                    onClick={() => { setShowForm(false); setTime('') }}
                  >
                    <X size={16} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
