import { ListRow } from '@/components/ui/list-row'
import { MAX_REMINDERS_PER_HABIT, MIN_RELATIVE_REMINDER_MINUTES, MAX_RELATIVE_REMINDER_MINUTES } from '@orbit/shared/validation'
import { PillButton } from '@/components/ui/pill-button'
import { useState, useMemo, type ReactNode } from 'react'
import { X, Plus } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { HABIT_REMINDER_PRESETS } from '@orbit/shared/utils'
import { Select } from '@/components/ui/select'

interface ReminderSectionProps {
  reminderEnabled: boolean
  reminderTimes: number[]
  onReminderTimesChange: (times: number[]) => void
  reminderLabel: (minutes: number) => string
  t: ReturnType<typeof useTranslations>
  children?: ReactNode
  scheduledReminderCount?: number
  onValidationError?: (message: string) => void
}

export function ReminderSection({
  reminderEnabled, reminderTimes,
  onReminderTimesChange, reminderLabel, t, children,
  scheduledReminderCount = 0, onValidationError,
}: Readonly<ReminderSectionProps>) {
  const [showAddReminder, setShowAddReminder] = useState(false)
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customValue, setCustomValue] = useState<number | null>(null)
  const [customUnit, setCustomUnit] = useState<'min' | 'hours' | 'days'>('min')
  const [customDirection, setCustomDirection] = useState<'before' | 'after'>('before')

  const reminderUnitOptions = useMemo(() => [
    { value: 'min', label: t('habits.form.reminderUnitMin') },
    { value: 'hours', label: t('habits.form.reminderUnitHours') },
    { value: 'days', label: t('habits.form.reminderUnitDays') },
  ], [t])

  const availablePresets = useMemo(
    () => HABIT_REMINDER_PRESETS.filter((p) => !reminderTimes.includes(p.value)),
    [reminderTimes],
  )
  const atLimit = reminderTimes.length + scheduledReminderCount >= MAX_REMINDERS_PER_HABIT

  function addPreset(value: number) {
    if (reminderTimes.length + scheduledReminderCount >= MAX_REMINDERS_PER_HABIT) {
      onValidationError?.(t('habits.form.relativeReminderMax', { count: MAX_REMINDERS_PER_HABIT }))
      return
    }
    if (!reminderTimes.includes(value)) {
      onReminderTimesChange([...reminderTimes, value].sort((a, b) => b - a))
    }
    setShowAddReminder(false)
  }

  function addCustomReminder() {
    if (!customValue || !Number.isInteger(customValue) || customValue <= 0) {
      onValidationError?.(t('habits.form.invalidRelativeReminder'))
      return
    }
    let multiplier = 1
    if (customUnit === 'days') multiplier = 1440
    else if (customUnit === 'hours') multiplier = 60
    const minutes = customValue * multiplier * (customDirection === 'after' ? -1 : 1)
    if (minutes < MIN_RELATIVE_REMINDER_MINUTES || minutes > MAX_RELATIVE_REMINDER_MINUTES) {
      onValidationError?.(t('habits.form.invalidRelativeReminder'))
      return
    }
    if (reminderTimes.length + scheduledReminderCount >= MAX_REMINDERS_PER_HABIT) {
      onValidationError?.(t('habits.form.relativeReminderMax', { count: MAX_REMINDERS_PER_HABIT }))
      return
    }
    if (!reminderTimes.includes(minutes)) {
      onReminderTimesChange([...reminderTimes, minutes].sort((a, b) => b - a))
    }
    setCustomValue(null)
    setShowCustomInput(false)
    setShowAddReminder(false)
  }

  function removeReminder(value: number) {
    onReminderTimesChange(reminderTimes.filter((v) => v !== value))
  }

  return (
    <div className="flex flex-col gap-3">
      {reminderEnabled && (
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex min-w-0 flex-col gap-3">
          <div data-reminder-chips className="flex flex-wrap gap-2 pb-2">
            {reminderTimes.map((time) => (
              <span
                key={time}
                data-reminder-chip className="inline-flex max-w-full items-center gap-1 rounded-[12px] bg-[rgba(var(--primary-rgb),0.12)] px-3 py-2 text-[var(--fg-1)]"
                style={{ fontFamily: 'var(--font-sans)', fontSize: '0.75rem', fontWeight: 500 }}
              >
                <span className="min-w-0 break-words">{reminderLabel(time)}</span>
                <button
                  type="button"
                  aria-label={t('habits.form.removeReminder')}
                  className={`grid shrink-0 place-items-center min-h-[var(--touch-min)] min-w-[var(--touch-min)] rounded-full hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] transition-colors duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] ${reminderTimes.length + scheduledReminderCount <= 1 ? 'opacity-30 cursor-not-allowed' : 'hover:text-[var(--fg-2)]'}`}
                  disabled={reminderTimes.length + scheduledReminderCount <= 1}
                  onClick={() => removeReminder(time)}
                >
                  <X size={16} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
          {reminderTimes.length === 1 && scheduledReminderCount === 0 ? (
            <p className="text-xs leading-[1.5] text-[var(--fg-3)]">
              {t('habits.form.reminderLastRequired')}
            </p>
          ) : null}

          <div className="relative">
            {atLimit ? <p className="text-sm text-[var(--fg-3)]">{t('habits.form.relativeReminderMax', { count: MAX_REMINDERS_PER_HABIT })}</p> : null}
            {!atLimit ? <>
            <div className="px-2"><ListRow placement="column" title={t('habits.form.reminderAdd')} icon="plus" expanded={showAddReminder} onClick={() => { setShowAddReminder(!showAddReminder); setShowCustomInput(false) }} /></div>

            {showAddReminder && (
              <div className="mt-2 rounded-[14px] bg-[var(--bg-sheet)] shadow-[var(--shadow-2),inset_0_0_0_1px_var(--hairline)] p-1">
                {availablePresets.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className="flex min-h-[var(--touch-min)] w-full items-center px-3 py-2 text-left rounded-[12px] text-sm text-[var(--fg-1)] enabled:hover:bg-[var(--bg-hover)] enabled:active:bg-[var(--bg-hover)] transition-colors duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]"
                    onClick={() => addPreset(preset.value)}
                  >
                    {t(preset.key as Parameters<typeof t>[0])}
                  </button>
                ))}
                {showCustomInput && (
                  <div className="flex flex-wrap items-end gap-2 px-3 py-2">
                    <label className="flex flex-col gap-2 text-sm font-medium text-[var(--fg-2)]">
                      {t('habits.form.reminderCustomLabel')}
                      <input
                        value={customValue ?? ''}
                        type="number"
                        min={1}
                        className="w-20 bg-[var(--bg-field)] text-[var(--fg-1)] placeholder:text-[var(--fg-3)] rounded-[12px] py-2 px-3 text-sm border-0 shadow-[inset_0_0_0_1px_var(--hairline)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--primary)] transition-[box-shadow] duration-[var(--dur-fast)]"
                        onChange={(e) => setCustomValue(e.target.value ? Number(e.target.value) : null)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomReminder() } }}
                      />
                    </label>
                    <div className="flex min-w-0 flex-col gap-2"><span className="text-sm font-medium text-[var(--fg-2)]">{t('habits.form.reminderCustomUnit')}</span><Select
                      value={customUnit}
                      options={reminderUnitOptions}
                      label={t('habits.form.reminderCustomUnit')}
                      onChange={(val) => setCustomUnit(val as 'min' | 'hours' | 'days')}
                    /></div>
                    <div className="flex min-w-0 flex-col gap-2"><span className="text-sm font-medium text-[var(--fg-2)]">{t('habits.form.reminderDirection')}</span><Select
                      value={customDirection}
                      options={[
                        { value: 'before', label: t('habits.form.reminderBefore') },
                        { value: 'after', label: t('habits.form.reminderAfter') },
                      ]}
                      label={t('habits.form.reminderDirection')}
                      onChange={(value) => setCustomDirection(value as 'before' | 'after')}
                    /></div>
                    <div className="flex min-h-12 min-w-12 items-center justify-center [&_button]:scroll-m-1">
                      <PillButton variant="ghost" size="sm" iconOnly label={t('common.add')} onClick={addCustomReminder}><Plus size={20} aria-hidden="true" /></PillButton>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  className="flex min-h-[var(--touch-min)] w-full items-center px-3 py-2 text-left rounded-[12px] text-sm text-[var(--fg-1)] font-medium enabled:hover:bg-[var(--bg-hover)] enabled:active:bg-[var(--bg-hover)] transition-colors duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]"
                  onClick={() => setShowCustomInput(!showCustomInput)}
                >
                  {t('habits.form.reminderCustom')}
                </button>
              </div>
            )}
            </> : null}
          </div>
          </div>
          {children}
        </div>
      )}
    </div>
  )
}
