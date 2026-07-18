import { useState, useMemo } from 'react'
import { X, Plus, Bell } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { HABIT_REMINDER_PRESETS } from '@orbit/shared/utils'
import { AppSelect } from '@/components/ui/app-select'
import { Switch } from '@/components/ui/settings-row'

interface ReminderSectionProps {
  reminderEnabled: boolean
  reminderTimes: number[]
  onReminderTimesChange: (times: number[]) => void
  onToggleReminder: () => void
  reminderLabel: (minutes: number) => string
  t: ReturnType<typeof useTranslations>
}

export function ReminderSection({
  reminderEnabled, reminderTimes,
  onReminderTimesChange, onToggleReminder, reminderLabel, t,
}: Readonly<ReminderSectionProps>) {
  const [showAddReminder, setShowAddReminder] = useState(false)
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customValue, setCustomValue] = useState<number | null>(null)
  const [customUnit, setCustomUnit] = useState<'min' | 'hours' | 'days'>('min')

  const reminderUnitOptions = useMemo(() => [
    { value: 'min', label: t('habits.form.reminderUnitMin') },
    { value: 'hours', label: t('habits.form.reminderUnitHours') },
    { value: 'days', label: t('habits.form.reminderUnitDays') },
  ], [t])

  const availablePresets = useMemo(
    () => HABIT_REMINDER_PRESETS.filter((p) => !reminderTimes.includes(p.value)),
    [reminderTimes],
  )

  function addPreset(value: number) {
    if (!reminderTimes.includes(value)) {
      onReminderTimesChange([...reminderTimes, value].sort((a, b) => b - a))
    }
    setShowAddReminder(false)
  }

  function addCustomReminder() {
    if (!customValue || customValue <= 0) return
    let multiplier = 1
    if (customUnit === 'days') multiplier = 1440
    else if (customUnit === 'hours') multiplier = 60
    const minutes = customValue * multiplier
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
    <div className="flex flex-col gap-3 rounded-[14px] bg-[var(--bg-field)] p-4 shadow-[inset_0_0_0_1px_var(--hairline)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Bell size={20} strokeWidth={1.8} className="text-[var(--fg-2)]" aria-hidden="true" />
          <span
            className="text-[var(--fg-1)]"
            style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500 }}
          >
            {t('habits.form.reminder')}
          </span>
        </div>
        <Switch
          on={reminderEnabled}
          onToggle={onToggleReminder}
          ariaLabel={t('habits.form.reminder')}
        />
      </div>
      {reminderEnabled && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {reminderTimes.map((time) => (
              <span
                key={time}
                className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(var(--primary-rgb),0.12)] px-3 py-1.5 text-[var(--primary)]"
                style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500 }}
              >
                {reminderLabel(time)}
                <button
                  type="button"
                  aria-label={t('habits.form.removeReminder')}
                  className={`grid place-items-center min-h-[44px] min-w-[44px] -my-2.5 -mr-2.5 -ml-1 transition-colors ${reminderTimes.length <= 1 ? 'opacity-30 cursor-not-allowed' : 'hover:text-[var(--primary-pressed)]'}`}
                  disabled={reminderTimes.length <= 1}
                  onClick={() => removeReminder(time)}
                >
                  <X size={13} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>

          <div className="relative">
            <button
              type="button"
              aria-expanded={showAddReminder}
              className="chip"
              onClick={() => { setShowAddReminder(!showAddReminder); setShowCustomInput(false) }}
            >
              <Plus size={14} strokeWidth={2} aria-hidden="true" />
              {t('habits.form.reminderAdd')}
            </button>

            {showAddReminder && (
              <div className="mt-2 rounded-[14px] bg-[var(--bg-sheet)] shadow-[var(--shadow-2),inset_0_0_0_1px_var(--hairline)] p-1.5">
                {availablePresets.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className="w-full text-left px-3.5 py-2.5 rounded-[10px] text-[15px] text-[var(--fg-1)] hover:bg-[var(--bg-elev)] transition-colors duration-[var(--dur-fast)]"
                    onClick={() => addPreset(preset.value)}
                  >
                    {t(preset.key as Parameters<typeof t>[0])}
                  </button>
                ))}
                {showCustomInput && (
                  <div className="flex items-center gap-2 px-3 py-2">
                    <input
                      value={customValue ?? ''}
                      type="number"
                      min={1}
                      aria-label={t('habits.form.reminderCustomPlaceholder')}
                      placeholder={t('habits.form.reminderCustomPlaceholder')}
                      className="w-20 bg-[var(--bg-field)] text-[var(--fg-1)] placeholder:text-[var(--fg-3)] rounded-[12px] py-2 px-3 text-sm border-0 shadow-[inset_0_0_0_1px_var(--hairline)] focus:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--primary)] transition-[box-shadow] duration-[var(--dur-fast)]"
                      onChange={(e) => setCustomValue(e.target.value ? Number(e.target.value) : null)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomReminder() } }}
                    />
                    <AppSelect
                      value={customUnit}
                      options={reminderUnitOptions}
                      label={t('habits.form.reminderCustom')}
                      onChange={(val) => setCustomUnit(val as 'min' | 'hours' | 'days')}
                    />
                    <button
                      type="button"
                      aria-label={t('common.add')}
                      className="touch-target shrink-0 grid size-9 place-items-center rounded-full bg-[var(--primary)] text-[var(--fg-on-primary)] hover:bg-[var(--primary-pressed)] transition-[background-color,transform] duration-[var(--dur-fast)] active:scale-[0.96]"
                      onClick={addCustomReminder}
                    >
                      <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  className="w-full text-left px-3.5 py-2.5 rounded-[10px] text-[15px] text-[var(--primary)] font-medium hover:bg-[var(--bg-elev)] transition-colors duration-[var(--dur-fast)]"
                  onClick={() => setShowCustomInput(!showCustomInput)}
                >
                  {t('habits.form.reminderCustom')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
