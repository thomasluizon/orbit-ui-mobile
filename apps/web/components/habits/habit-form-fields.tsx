'use client'

import { useState, useMemo, useId, type ReactNode } from 'react'
import { X, Plus, Bell, Check, ShieldAlert, PenSquare } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import type { FrequencyUnit, ScheduledReminderWhen, HabitTag } from '@orbit/shared/types/habit'
import { tagKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { HabitChecklist } from './habit-checklist'
import { ChecklistTemplates } from './checklist-templates'
import { GoalLinkingField } from './goal-linking-field'
import { AppDatePicker } from '@/components/ui/app-date-picker'
import { AppSelect } from '@/components/ui/app-select'
import type { TagSelectionState } from '@/hooks/use-tag-selection'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import { useHasProAccess } from '@/hooks/use-profile'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HabitFormFieldsProps {
  formHelpers: HabitFormHelpers
  tags: TagSelectionState
  selectedGoalIds: string[]
  atGoalLimit: boolean
  onToggleGoal: (goalId: string) => void
  /** Controlled reminderTimes state from parent modal */
  reminderTimes: number[]
  onReminderTimesChange: (times: number[]) => void
  children?: ReactNode
}

// ---------------------------------------------------------------------------
// Reminder presets
// ---------------------------------------------------------------------------

const REMINDER_PRESETS = [
  { value: 0, key: 'habits.form.reminderAtTime' },
  { value: 5, key: 'habits.form.reminder5min' },
  { value: 10, key: 'habits.form.reminder10min' },
  { value: 15, key: 'habits.form.reminder15min' },
  { value: 30, key: 'habits.form.reminder30min' },
  { value: 60, key: 'habits.form.reminder1hour' },
  { value: 120, key: 'habits.form.reminder2hours' },
  { value: 360, key: 'habits.form.reminder6hours' },
  { value: 720, key: 'habits.form.reminder12hours' },
  { value: 1440, key: 'habits.form.reminder1day' },
] as const

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HabitFormFields({
  formHelpers,
  tags,
  selectedGoalIds,
  atGoalLimit,
  onToggleGoal,
  reminderTimes,
  onReminderTimesChange,
  children,
}: HabitFormFieldsProps) {
  const t = useTranslations()
  const reminderLabelId = useId()
  const scheduledReminderLabelId = useId()
  const slipAlertLabelId = useId()
  const slipAlertDescriptionId = useId()
  const hasProAccess = useHasProAccess()

  const {
    form,
    isOneTime,
    isGeneral,
    isFlexible,
    showDayPicker,
    showEndDate,
    daysList,
    frequencyUnits,
    setOneTime,
    setRecurring,
    setFlexible,
    setGeneral,
    toggleDay,
    formatTimeInput,
    formatEndTimeInput,
  } = formHelpers

  const { register, watch, setValue, getValues } = form

  const watchedFrequencyUnit = watch('frequencyUnit')
  const watchedFrequencyQuantity = watch('frequencyQuantity')
  const watchedDays = watch('days')
  const watchedDueDate = watch('dueDate')
  const watchedDueTime = watch('dueTime')
  const watchedDueEndTime = watch('dueEndTime')
  const watchedEndDate = watch('endDate')
  const watchedIsBadHabit = watch('isBadHabit')
  const watchedReminderEnabled = watch('reminderEnabled')
  const watchedSlipAlertEnabled = watch('slipAlertEnabled')
  const watchedChecklistItems = watch('checklistItems')
  const watchedScheduledReminders = watch('scheduledReminders')

  // Fetch tags
  const { data: tagsData } = useQuery({
    queryKey: tagKeys.lists(),
    queryFn: async (): Promise<HabitTag[]> => {
      const res = await fetch(API.tags.list)
      if (!res.ok) throw new Error('Failed to fetch tags')
      return (await res.json()) as HabitTag[]
    },
    staleTime: QUERY_STALE_TIMES.tags,
  })

  const availableTags = tagsData ?? []

  // Time validation
  function isValidTime(time: string): boolean {
    if (time.length !== 5) return true
    const [hStr, mStr] = time.split(':')
    const h = Number.parseInt(hStr ?? "", 10)
    const m = Number.parseInt(mStr ?? "", 10)
    return !Number.isNaN(h) && !Number.isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59
  }

  // Reminder state
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
    () => REMINDER_PRESETS.filter((p) => !reminderTimes.includes(p.value)),
    [reminderTimes],
  )

  function reminderLabel(minutes: number): string {
    const preset = REMINDER_PRESETS.find((p) => p.value === minutes)
    if (preset) return t(preset.key as Parameters<typeof t>[0])
    if (minutes < 60) return `${minutes} ${t('habits.form.reminderMinutes')}`
    if (minutes < 1440) {
      const h = Math.floor(minutes / 60)
      return `${h} ${t((h === 1 ? 'habits.form.reminderHour' : 'habits.form.reminderHours') as Parameters<typeof t>[0])}`
    }
    const d = Math.floor(minutes / 1440)
    return `${d} ${t((d === 1 ? 'habits.form.reminderDay' : 'habits.form.reminderDays') as Parameters<typeof t>[0])}`
  }

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

  // Scheduled reminders
  const MAX_SCHEDULED_REMINDERS = 5
  const [showScheduledReminderForm, setShowScheduledReminderForm] = useState(false)
  const [scheduledReminderWhen, setScheduledReminderWhen] = useState<ScheduledReminderWhen>('same_day')
  const [scheduledReminderTime, setScheduledReminderTime] = useState('')

  const atScheduledReminderLimit = (watchedScheduledReminders?.length ?? 0) >= MAX_SCHEDULED_REMINDERS

  function formatScheduledTimeInput(value: string): string {
    let v = value.replace(/\D/g, '')
    if (v.length > 4) v = v.slice(0, 4)
    if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2)
    return v
  }

  function isValidScheduledTime(time: string): boolean {
    if (time.length !== 5) return false
    const [hStr, mStr] = time.split(':')
    const h = Number.parseInt(hStr ?? "", 10)
    const m = Number.parseInt(mStr ?? "", 10)
    return !Number.isNaN(h) && !Number.isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59
  }

  function addScheduledReminder() {
    if (!isValidScheduledTime(scheduledReminderTime)) return
    if (atScheduledReminderLimit) return
    const current = watchedScheduledReminders ?? []
    const duplicate = current.some(
      (sr) => sr.when === scheduledReminderWhen && sr.time === scheduledReminderTime,
    )
    if (duplicate) return
    setValue('scheduledReminders', [...current, { when: scheduledReminderWhen, time: scheduledReminderTime }], { shouldDirty: true })
    setScheduledReminderTime('')
    setShowScheduledReminderForm(false)
  }

  function removeScheduledReminder(index: number) {
    const current = watchedScheduledReminders ?? []
    setValue('scheduledReminders', current.filter((_, i) => i !== index), { shouldDirty: true })
  }

  function scheduledReminderLabel(sr: { when: string; time: string }): string {
    const timeDisplay = sr.time.slice(0, 5)
    if (sr.when === 'day_before') {
      return t('habits.form.scheduledReminderDayBeforeAt', { time: timeDisplay })
    }
    return t('habits.form.scheduledReminderSameDayAt', { time: timeDisplay })
  }

  // Tag pop animation
  const [justToggledTagId, setJustToggledTagId] = useState('')

  function handleTagToggle(tagId: string) {
    if (!tags.selectedTagIds.includes(tagId)) {
      setJustToggledTagId(tagId)
      setTimeout(() => setJustToggledTagId(''), 200)
    }
    tags.toggleTag(tagId)
  }

  return (
    <>
      {/* Title */}
      <div className="space-y-1.5">
        <label htmlFor="habit-form-title" className="form-label">
          {t('habits.form.title')}
        </label>
        <input
          id="habit-form-title"
          type="text"
          maxLength={200}
          placeholder={t('habits.form.titlePlaceholder')}
          className="form-input"
          {...register('title')}
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <label htmlFor="habit-form-description" className="form-label">
          {t('habits.form.description')}
        </label>
        <textarea
          id="habit-form-description"
          placeholder={t('habits.form.descriptionPlaceholder')}
          rows={2}
          className="form-input resize-none"
          {...register('description')}
        />
      </div>

      {/* Checklist */}
      <div className="space-y-1.5">
        <span className="form-label" aria-hidden="true">
          {t('habits.form.checklist')}
        </span>
        <HabitChecklist
          items={watchedChecklistItems ?? []}
          editable
          onItemsChange={(items) => setValue('checklistItems', items, { shouldDirty: true })}
        />
        <ChecklistTemplates
          items={watchedChecklistItems ?? []}
          onLoad={(items) => setValue('checklistItems', items, { shouldDirty: true })}
        />
      </div>

      {/* Frequency toggle */}
      <div className="space-y-1.5">
        <span className="form-label" aria-hidden="true">
          {t('habits.form.frequency')}
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={isOneTime}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              isOneTime
                ? 'bg-primary text-white shadow-[var(--shadow-glow-sm)]'
                : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
            }`}
            onClick={setOneTime}
          >
            {t('habits.form.oneTimeTask')}
          </button>
          <button
            type="button"
            aria-pressed={!isOneTime && !isGeneral && !isFlexible}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              !isOneTime && !isGeneral && !isFlexible
                ? 'bg-primary text-white shadow-[var(--shadow-glow-sm)]'
                : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
            }`}
            onClick={setRecurring}
          >
            {t('habits.form.recurring')}
          </button>
          <button
            type="button"
            aria-pressed={isFlexible}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              isFlexible
                ? 'bg-primary text-white shadow-[var(--shadow-glow-sm)]'
                : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
            }`}
            onClick={setFlexible}
          >
            {t('habits.form.flexible')}
          </button>
          <button
            type="button"
            aria-pressed={isGeneral}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              isGeneral
                ? 'bg-primary text-white shadow-[var(--shadow-glow-sm)]'
                : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
            }`}
            onClick={setGeneral}
          >
            {t('habits.form.general')}
          </button>
        </div>
      </div>

      {/* Flexible description */}
      {isFlexible && (
        <p className="text-xs text-text-muted -mt-1">
          {t('habits.form.flexibleDescription', {
            n: watchedFrequencyQuantity ?? 3,
            unit: watchedFrequencyUnit
              ? t(`habits.form.unit${watchedFrequencyUnit}` as Parameters<typeof t>[0])
              : '',
          })}
        </p>
      )}

      {/* Frequency picker */}
      {!isOneTime && !isGeneral && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="habit-form-frequency-qty" className="form-label">
              {isFlexible
                ? t('habits.form.timesPerUnit')
                : t('habits.form.every')}
            </label>
            <input
              id="habit-form-frequency-qty"
              type="number"
              min={1}
              required
              className="form-input"
              {...register('frequencyQuantity', { valueAsNumber: true })}
            />
          </div>
          <div className="space-y-1.5">
            <span className="form-label" aria-hidden="true">
              {t('habits.form.unit')}
            </span>
            <AppSelect
              value={watchedFrequencyUnit ?? ''}
              options={frequencyUnits.map((u) => ({
                value: u.value,
                label: u.label,
              }))}
              label={t('habits.form.unit')}
              onChange={(val) =>
                setValue('frequencyUnit', val as FrequencyUnit, {
                  shouldDirty: true,
                })
              }
            />
          </div>
        </div>
      )}

      {/* Day picker */}
      {showDayPicker && !isGeneral && (
        <div className="space-y-1.5">
          <span className="form-label" aria-hidden="true">
            {t('habits.form.activeDays')}
          </span>
          <div className="flex flex-wrap gap-2">
            {daysList.map((day) => (
              <button
                key={day.value}
                type="button"
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  watchedDays?.includes(day.value)
                    ? 'bg-primary text-white'
                    : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
                }`}
                onClick={() => toggleDay(day.value)}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Due date */}
      {!isGeneral && (
        <div className="space-y-1.5">
          <span className="form-label" aria-hidden="true">
            {t('habits.form.dueDate')}
          </span>
          <AppDatePicker
            value={watchedDueDate}
            onChange={(val) => setValue('dueDate', val, { shouldDirty: true })}
          />
        </div>
      )}

      {/* Due time */}
      {!isGeneral && (
        <div className="space-y-1.5">
          <label htmlFor="habit-form-due-time" className="form-label">
            {t('habits.form.dueTime')}
          </label>
          <input
            id="habit-form-due-time"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{2}:[0-9]{2}"
            placeholder={t('habits.form.scheduledReminderTimePlaceholder')}
            maxLength={5}
            className="form-input"
            value={watchedDueTime}
            onChange={(e) => {
              const formatted = formatTimeInput(e.target.value)
              setValue('dueTime', formatted, { shouldDirty: true })
            }}
          />
          {watchedDueTime.length === 5 && !isValidTime(watchedDueTime) && (
            <p className="text-xs text-red-400 font-medium">
              {t('habits.form.invalidTime')}
            </p>
          )}
        </div>
      )}

      {/* End time */}
      {watchedDueTime && !isGeneral && (
        <div className="space-y-1.5">
          <label htmlFor="habit-form-due-end-time" className="form-label">
            {t('habits.form.dueEndTime')}
          </label>
          <input
            id="habit-form-due-end-time"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{2}:[0-9]{2}"
            placeholder={t('habits.form.scheduledReminderTimePlaceholder')}
            maxLength={5}
            className="form-input"
            value={watchedDueEndTime}
            onChange={(e) => {
              const formatted = formatEndTimeInput(e.target.value)
              setValue('dueEndTime', formatted, { shouldDirty: true })
            }}
          />
          {watchedDueEndTime.length === 5 &&
            !isValidTime(watchedDueEndTime) && (
              <p className="text-xs text-red-400 font-medium">
                {t('habits.form.invalidEndTime')}
              </p>
            )}
          {watchedDueEndTime &&
            watchedDueTime &&
            watchedDueEndTime <= watchedDueTime && (
              <p className="text-xs text-red-400 font-medium">
                {t('habits.form.endTimeBeforeStartTime')}
              </p>
            )}
        </div>
      )}

      {/* End date (recurring only) */}
      {showEndDate && (
        <div className="space-y-1.5">
          {watchedEndDate ? (
            <div className="space-y-1.5">
              <span className="form-label" aria-hidden="true">
                {t('habits.form.endDate')}
              </span>
              <div className="flex items-center gap-2">
                <AppDatePicker
                  value={watchedEndDate}
                  onChange={(val) =>
                    setValue('endDate', val, { shouldDirty: true })
                  }
                />
                <button
                  type="button"
                  aria-label={t('habits.form.removeEndDate')}
                  className="shrink-0 p-2 text-text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors rounded-full"
                  onClick={() => setValue('endDate', '', { shouldDirty: true })}
                >
                  <X className="size-4" />
                </button>
              </div>
              {watchedEndDate && watchedDueDate && watchedEndDate < watchedDueDate ? (
                <p className="text-xs text-red-400 font-medium">{t('habits.form.endDateBeforeDueDate')}</p>
              ) : (
                <p className="text-xs text-text-muted">{t('habits.form.endDateHint')}</p>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
              onClick={() =>
                setValue('endDate', watchedDueDate || '', {
                  shouldDirty: true,
                })
              }
            >
              <Plus className="size-3.5" aria-hidden="true" />
              {t('habits.form.addEndDate')}
            </button>
          )}
        </div>
      )}

      {/* Reminder (only when dueTime is set, hidden for general habits) */}
      {watchedDueTime && !isGeneral && (
        <div className="space-y-3 rounded-lg border border-border-muted p-4 bg-surface-ground">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="size-4 text-primary" />
              <span id={reminderLabelId} className="text-sm font-medium text-text-primary">{t('habits.form.reminder')}</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={watchedReminderEnabled}
              aria-labelledby={reminderLabelId}
              className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 ${watchedReminderEnabled ? 'bg-primary' : 'bg-surface-elevated'}`}
              onClick={() => setValue('reminderEnabled', !watchedReminderEnabled, { shouldDirty: true })}
            >
              <span className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform duration-200 ${watchedReminderEnabled ? 'translate-x-4.5' : 'translate-x-0'}`} />
            </button>
          </div>
          {watchedReminderEnabled && (
            <div className="space-y-3">
              {/* Selected reminder chips */}
              <div className="flex flex-wrap gap-2">
                {reminderTimes.map((time) => (
                  <span
                    key={time}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/15 text-primary"
                  >
                    {reminderLabel(time)}
                    <button
                      type="button"
                      aria-label={t('habits.form.removeReminder')}
                      className={`transition-colors ${reminderTimes.length <= 1 ? 'opacity-30 cursor-not-allowed' : 'hover:text-primary/60'}`}
                      disabled={reminderTimes.length <= 1}
                      onClick={() => removeReminder(time)}
                    >
                      <X className="size-3" aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>

              {/* Add reminder */}
              <div className="relative">
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                  onClick={() => { setShowAddReminder(!showAddReminder); setShowCustomInput(false) }}
                >
                  <Plus className="size-3.5" />
                  {t('habits.form.reminderAdd')}
                </button>

                {showAddReminder && (
                  <div className="mt-2 rounded-lg border border-border-muted bg-surface-overlay shadow-[var(--shadow-lg)] p-1">
                    {availablePresets.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        className="w-full text-left px-3 py-2 rounded-xl text-sm text-text-primary hover:bg-surface-elevated/80 transition-all duration-150"
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
                          className="w-20 bg-surface text-text-primary rounded-xl py-1.5 px-3 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                          className="shrink-0 p-1.5 rounded-full bg-primary text-white hover:bg-primary/90 transition-all duration-150"
                          onClick={addCustomReminder}
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 rounded-xl text-sm text-primary font-medium hover:bg-surface-elevated/80 transition-all duration-150"
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
      )}

      {/* Scheduled reminders (when no dueTime, hidden for general habits) */}
      {!watchedDueTime && !isGeneral && (
        <div className="space-y-3 rounded-lg border border-border-muted p-4 bg-surface-ground">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="size-4 text-primary" />
              <span id={scheduledReminderLabelId} className="text-sm font-medium text-text-primary">{t('habits.form.scheduledReminder')}</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={watchedReminderEnabled}
              aria-labelledby={scheduledReminderLabelId}
              className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 ${watchedReminderEnabled ? 'bg-primary' : 'bg-surface-elevated'}`}
              onClick={() => setValue('reminderEnabled', !watchedReminderEnabled, { shouldDirty: true })}
            >
              <span className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform duration-200 ${watchedReminderEnabled ? 'translate-x-4.5' : 'translate-x-0'}`} />
            </button>
          </div>
          {watchedReminderEnabled && (
            <div className="space-y-3">
              {(watchedScheduledReminders?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-2">
                  {(watchedScheduledReminders ?? []).map((sr, idx) => (
                    <span
                      key={`${sr.when}-${sr.time}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/15 text-primary"
                    >
                      {scheduledReminderLabel(sr)}
                      <button type="button" aria-label={t('habits.form.removeScheduledReminder')} className="hover:text-primary/60 transition-colors" onClick={() => removeScheduledReminder(idx)}>
                        <X className="size-3" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div>
                {!showScheduledReminderForm && !atScheduledReminderLimit && (
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                    onClick={() => setShowScheduledReminderForm(true)}
                  >
                    <Plus className="size-3.5" />
                    {t('habits.form.scheduledReminderAdd')}
                  </button>
                )}

                {atScheduledReminderLimit && (
                  <p className="text-xs text-text-muted">{t('habits.form.scheduledReminderMax')}</p>
                )}

                {showScheduledReminderForm && (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={`flex-1 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                          scheduledReminderWhen === 'day_before'
                            ? 'bg-primary text-white shadow-[var(--shadow-glow-sm)]'
                            : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
                        }`}
                        onClick={() => setScheduledReminderWhen('day_before')}
                      >
                        {t('habits.form.scheduledReminderDayBefore')}
                      </button>
                      <button
                        type="button"
                        className={`flex-1 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                          scheduledReminderWhen === 'same_day'
                            ? 'bg-primary text-white shadow-[var(--shadow-glow-sm)]'
                            : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
                        }`}
                        onClick={() => setScheduledReminderWhen('same_day')}
                      >
                        {t('habits.form.scheduledReminderSameDay')}
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        value={scheduledReminderTime}
                        type="text"
                        inputMode="numeric"
                        aria-label={t('habits.form.scheduledReminderTimePlaceholder')}
                        pattern="[0-9]{2}:[0-9]{2}"
                        placeholder={t('habits.form.scheduledReminderTimePlaceholder')}
                        maxLength={5}
                        className="flex-1 bg-surface text-text-primary placeholder-text-muted rounded-xl py-2 px-3 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                        onChange={(e) => setScheduledReminderTime(formatScheduledTimeInput(e.target.value))}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addScheduledReminder() } }}
                      />
                      <button
                        type="button"
                        className="shrink-0 px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all duration-150 disabled:opacity-40"
                        disabled={!isValidScheduledTime(scheduledReminderTime)}
                        onClick={addScheduledReminder}
                      >
                        {t('common.add')}
                      </button>
                      <button
                        type="button"
                        aria-label={t('common.cancel')}
                        className="shrink-0 p-2 text-text-muted hover:text-text-primary transition-colors"
                        onClick={() => { setShowScheduledReminderForm(false); setScheduledReminderTime('') }}
                      >
                        <X className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tags */}
      <div className="space-y-1.5">
        <span className="form-label" aria-hidden="true">
          {t('habits.form.tags')}
        </span>
        <div className="flex flex-wrap gap-2">
          {availableTags.map((tag) => (
            <div
              key={tag.id}
              className={`flex items-center rounded-full text-xs font-semibold transition-all ${
                tags.selectedTagIds.includes(tag.id)
                  ? 'text-white'
                  : 'bg-surface border border-border text-text-secondary'
              } ${
                !tags.selectedTagIds.includes(tag.id) && tags.atTagLimit
                  ? 'opacity-30 pointer-events-none'
                  : ''
              } ${justToggledTagId === tag.id ? 'animate-tag-pop' : ''}`}
              style={
                tags.selectedTagIds.includes(tag.id)
                  ? { backgroundColor: tag.color }
                  : undefined
              }
            >
              <button
                type="button"
                className="pl-3 pr-1 py-1.5 flex items-center gap-1.5 hover:opacity-80"
                onClick={() => handleTagToggle(tag.id)}
              >
                {!tags.selectedTagIds.includes(tag.id) && (
                  <span className="size-2 rounded-full" style={{ backgroundColor: tag.color }} />
                )}
                {tag.name}
              </button>
              <button
                type="button"
                className={`pl-0.5 py-1.5 hover:opacity-60 transition-opacity ${
                  tags.selectedTagIds.includes(tag.id) ? 'text-white/70' : 'text-text-muted'
                }`}
                aria-label={t('habits.form.editTag')}
                onClick={(e) => { e.stopPropagation(); tags.startEditTag(tag) }}
              >
                <PenSquare className="size-3" aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`pr-2 pl-0.5 py-1.5 hover:opacity-60 transition-opacity ${
                  tags.selectedTagIds.includes(tag.id) ? 'text-white/70' : 'text-text-muted'
                }`}
                aria-label={t('habits.form.deleteTag')}
                onClick={(e) => { e.stopPropagation(); tags.deleteTag(tag.id, async () => {}) }}
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </div>
          ))}
          {!tags.showNewTag && !tags.atTagLimit && (
            <button
              type="button"
              className="px-3 py-1.5 rounded-full text-xs font-semibold bg-surface border border-dashed border-border text-text-muted hover:text-text-primary hover:border-primary/50 transition-all"
              onClick={() => tags.setShowNewTag(true)}
            >
              + {t('habits.form.newTag')}
            </button>
          )}
        </div>
        {/* Inline tag edit */}
        {tags.editingTagId && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {tags.tagColors.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={t('habits.form.selectColor', { color: c })}
                  aria-pressed={tags.editTagColor === c}
                  className={`size-5 rounded-full transition-all ${
                    tags.editTagColor === c
                      ? 'ring-2 ring-white ring-offset-2 ring-offset-background scale-110'
                      : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => tags.setEditTagColor(c)}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={tags.editTagName}
                type="text"
                aria-label={t('habits.form.tagName')}
                maxLength={50}
                className="flex-1 min-w-0 bg-surface text-text-primary placeholder-text-muted rounded-xl py-2 px-3 text-xs border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
                onChange={(e) => tags.setEditTagName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); tags.saveEditTag(async () => {}) } }}
              />
              <button type="button" className="shrink-0 px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all duration-150" onClick={() => tags.saveEditTag(async () => {})}>{t('common.save')}</button>
              <button type="button" aria-label={t('common.cancel')} className="shrink-0 p-2 text-text-muted hover:text-text-primary" onClick={tags.cancelEditTag}>
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
        {/* Inline new tag creation */}
        {tags.showNewTag && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {tags.tagColors.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={t('habits.form.selectColor', { color: c })}
                  aria-pressed={tags.newTagColor === c}
                  className={`size-5 rounded-full transition-all ${
                    tags.newTagColor === c
                      ? 'ring-2 ring-white ring-offset-2 ring-offset-background scale-110'
                      : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => tags.setNewTagColor(c)}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={tags.newTagName}
                type="text"
                aria-label={t('habits.form.tagName')}
                placeholder={t('habits.form.tagName')}
                maxLength={50}
                className="flex-1 min-w-0 bg-surface text-text-primary placeholder-text-muted rounded-xl py-2 px-3 text-xs border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
                onChange={(e) => tags.setNewTagName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); tags.createAndSelectTag(async () => null) } }}
              />
              <button type="button" className="shrink-0 px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all duration-150" onClick={() => tags.createAndSelectTag(async () => null)}>{t('common.add')}</button>
              <button type="button" aria-label={t('common.cancel')} className="shrink-0 p-2 text-text-muted hover:text-text-primary" onClick={() => tags.setShowNewTag(false)}>
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Goals */}
      <GoalLinkingField
        selectedGoalIds={selectedGoalIds}
        atGoalLimit={atGoalLimit}
        onToggleGoal={onToggleGoal}
      />

      {/* Bad habit toggle */}
      {!isGeneral && (
        <label className="flex items-center gap-3 cursor-pointer py-1">
          <div
            className={`size-5 rounded-lg border-2 flex items-center justify-center transition-all ${
              watchedIsBadHabit ? 'bg-primary border-primary' : 'border-border'
            }`}
          >
            {watchedIsBadHabit && <Check className="size-3 text-white" />}
          </div>
          <input
            type="checkbox"
            className="hidden"
            checked={watchedIsBadHabit}
            onChange={(e) => setValue('isBadHabit', e.target.checked, { shouldDirty: true })}
          />
          <span className="text-sm text-text-primary">{t('habits.form.badHabitLabel')}</span>
        </label>
      )}

      {/* Slip alert toggle (only when bad habit) */}
      {watchedIsBadHabit && (
        <div className="space-y-3 rounded-lg border border-border-muted p-4 bg-surface-ground">
          {!hasProAccess ? (
            /* Pro locked state */
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="size-4 text-text-muted" />
                  <span className="text-sm font-medium text-text-muted">{t('habits.form.slipAlert')}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">{t('common.proBadge')}</span>
                </div>
                <span className="text-xs text-text-muted ml-6">{t('habits.form.slipAlertDescription')}</span>
              </div>
              <div className="relative w-10 h-5.5 rounded-full bg-surface-elevated shrink-0 ml-3 opacity-50 cursor-not-allowed">
                <span className="absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow" />
              </div>
            </div>
          ) : (
            /* Pro unlocked state */
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="size-4 text-primary" />
                  <span id={slipAlertLabelId} className="text-sm font-medium text-text-primary">{t('habits.form.slipAlert')}</span>
                </div>
                <span id={slipAlertDescriptionId} className="text-xs text-text-muted ml-6">{t('habits.form.slipAlertDescription')}</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={watchedSlipAlertEnabled}
                aria-labelledby={slipAlertLabelId}
                aria-describedby={slipAlertDescriptionId}
                className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 shrink-0 ml-3 ${watchedSlipAlertEnabled ? 'bg-primary' : 'bg-surface-elevated'}`}
                onClick={() => setValue('slipAlertEnabled', !watchedSlipAlertEnabled, { shouldDirty: true })}
              >
                <span className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform duration-200 ${watchedSlipAlertEnabled ? 'translate-x-4.5' : 'translate-x-0'}`} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Slot for extra fields (e.g. sub-habits) */}
      {children}
    </>
  )
}
