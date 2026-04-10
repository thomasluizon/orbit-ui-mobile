'use client'

import { useState, useMemo, useId, useCallback, type ReactNode } from 'react'
import { X, Plus, Bell, Check, ShieldAlert, PenSquare, CalendarCheck, Repeat, Shuffle, Infinity, ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { FrequencyUnit, ScheduledReminderWhen } from '@orbit/shared/types/habit'
import {
  HABIT_REMINDER_PRESETS,
  formatHabitTimeInput,
  getFriendlyErrorMessage,
  isValidHabitTimeInput,
} from '@orbit/shared/utils'
import { validateTagForm } from '@orbit/shared/validation'
import { HabitChecklist } from './habit-checklist'
import { ChecklistTemplates } from './checklist-templates'
import { GoalLinkingField } from './goal-linking-field'
import { AppDatePicker } from '@/components/ui/app-date-picker'
import { AppSelect } from '@/components/ui/app-select'
import { useAppToast } from '@/hooks/use-app-toast'
import type { TagSelectionState } from '@/hooks/use-tag-selection'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import { useHasProAccess } from '@/hooks/use-profile'
import { useCreateTag, useDeleteTag, useTags, useUpdateTag } from '@/hooks/use-tags'

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
  onReminderEnabledChange?: (nextEnabled: boolean) => void
  /** When true, advanced fields are visible by default (used in edit modal) */
  defaultExpanded?: boolean
  children?: ReactNode
}

// ---------------------------------------------------------------------------
// Reminder presets
// ---------------------------------------------------------------------------

interface PillToggleOption {
  key: string
  label: ReactNode
  active: boolean
  onClick: () => void
}

interface PillToggleRowProps {
  options: PillToggleOption[]
  containerClassName: string
  buttonClassName: string
  activeClassName: string
  inactiveClassName: string
}

function PillToggleRow({
  options,
  containerClassName,
  buttonClassName,
  activeClassName,
  inactiveClassName,
}: Readonly<PillToggleRowProps>) {
  return (
    <div className={containerClassName}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={option.active}
          className={`${buttonClassName} ${option.active ? activeClassName : inactiveClassName}`}
          onClick={option.onClick}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

interface ColorSwatchesProps {
  colors: readonly string[]
  activeColor: string
  onSelect: (color: string) => void
  ariaLabel: (color: string) => string
}

function ColorSwatches({
  colors,
  activeColor,
  onSelect,
  ariaLabel,
}: Readonly<ColorSwatchesProps>) {
  return (
    <div className="flex flex-wrap gap-1">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={ariaLabel(color)}
          aria-pressed={activeColor === color}
          className={`size-5 rounded-full transition-all ${
            activeColor === color
              ? 'ring-2 ring-white ring-offset-2 ring-offset-background scale-110'
              : 'hover:scale-110'
          }`}
          style={{ backgroundColor: color }}
          onClick={() => onSelect(color)}
        />
      ))}
    </div>
  )
}

interface TagEditorRowProps {
  value: string
  placeholder?: string
  inputAriaLabel: string
  actionLabel: string
  cancelAriaLabel: string
  disabled: boolean
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
}

function TagEditorRow({
  value,
  placeholder,
  inputAriaLabel,
  actionLabel,
  cancelAriaLabel,
  disabled,
  onChange,
  onCommit,
  onCancel,
}: Readonly<TagEditorRowProps>) {
  return (
    <div className="flex items-center gap-2">
      <input
        value={value}
        type="text"
        aria-label={inputAriaLabel}
        placeholder={placeholder}
        maxLength={50}
        disabled={disabled}
        className="flex-1 min-w-0 bg-surface text-text-primary placeholder-text-muted rounded-xl py-2 px-3 text-xs border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onCommit()
          }
        }}
      />
      <button
        type="button"
        className="shrink-0 px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all duration-150 disabled:opacity-50"
        disabled={disabled}
        onClick={onCommit}
      >
        {actionLabel}
      </button>
      <button
        type="button"
        aria-label={cancelAriaLabel}
        className="shrink-0 p-2 text-text-muted hover:text-text-primary"
        disabled={disabled}
        onClick={onCancel}
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}

interface HabitTagChipProps {
  tag: { id: string; name: string; color: string }
  selected: boolean
  animationClassName: string
  atLimit: boolean
  disabled: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  editAriaLabel: string
  deleteAriaLabel: string
}

function HabitTagChip({
  tag,
  selected,
  animationClassName,
  atLimit,
  disabled,
  onToggle,
  onEdit,
  onDelete,
  editAriaLabel,
  deleteAriaLabel,
}: Readonly<HabitTagChipProps>) {
  return (
    <div
      className={`flex items-center rounded-full text-xs font-semibold transition-all ${
        selected
          ? 'text-white'
          : 'bg-surface border border-border text-text-secondary'
      } ${
        !selected && atLimit
          ? 'opacity-30 pointer-events-none'
          : ''
      } ${animationClassName}`}
      style={selected ? { backgroundColor: tag.color } : undefined}
    >
      <button
        type="button"
        className="pl-3 pr-1 py-1.5 flex items-center gap-1.5 hover:opacity-80"
        onClick={onToggle}
      >
        {!selected && (
          <span className="size-2 rounded-full" style={{ backgroundColor: tag.color }} />
        )}
        {tag.name}
      </button>
      <button
        type="button"
        className={`pl-0.5 py-1.5 hover:opacity-60 transition-opacity ${
          selected ? 'text-white/70' : 'text-text-muted'
        }`}
        aria-label={editAriaLabel}
        disabled={disabled}
        onClick={onEdit}
      >
        <PenSquare className="size-3" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`pr-2 pl-0.5 py-1.5 hover:opacity-60 transition-opacity ${
          selected ? 'text-white/70' : 'text-text-muted'
        }`}
        aria-label={deleteAriaLabel}
        disabled={disabled}
        onClick={onDelete}
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reminder sub-component (S3776: extracted to reduce cognitive complexity)
// ---------------------------------------------------------------------------

interface ReminderSectionProps {
  reminderLabelId: string
  reminderEnabled: boolean
  reminderTimes: number[]
  onReminderTimesChange: (times: number[]) => void
  onToggleReminder: () => void
  reminderLabel: (minutes: number) => string
  t: ReturnType<typeof useTranslations>
}

function ReminderSection({
  reminderLabelId, reminderEnabled, reminderTimes,
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
    <div className="space-y-3 rounded-lg border border-border-muted p-4 bg-surface-ground">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-primary" />
          <span id={reminderLabelId} className="text-sm font-medium text-text-primary">{t('habits.form.reminder')}</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={reminderEnabled}
          aria-labelledby={reminderLabelId}
          className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 ${reminderEnabled ? 'bg-primary' : 'bg-surface-elevated'}`}
          onClick={onToggleReminder}
        >
          <span className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform duration-200 ${reminderEnabled ? 'translate-x-4.5' : 'translate-x-0'}`} />
        </button>
      </div>
      {reminderEnabled && (
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
  )
}

// ---------------------------------------------------------------------------
// Scheduled reminder sub-component (S3776: extracted to reduce cognitive complexity)
// ---------------------------------------------------------------------------

interface ScheduledReminderSectionProps {
  scheduledReminderLabelId: string
  reminderEnabled: boolean
  scheduledReminders: Array<{ when: ScheduledReminderWhen; time: string }> | undefined
  onToggleReminder: () => void
  onSetScheduledReminders: (reminders: Array<{ when: ScheduledReminderWhen; time: string }>) => void
  onValidationError: (message: string) => void
  t: ReturnType<typeof useTranslations>
}

function ScheduledReminderSection({
  scheduledReminderLabelId, reminderEnabled, scheduledReminders,
  onToggleReminder, onSetScheduledReminders, onValidationError, t,
}: Readonly<ScheduledReminderSectionProps>) {
  const MAX_SCHEDULED_REMINDERS = 5
  const [showForm, setShowForm] = useState(false)
  const [when, setWhen] = useState<ScheduledReminderWhen>('same_day')
  const [time, setTime] = useState('')

  const atLimit = (scheduledReminders?.length ?? 0) >= MAX_SCHEDULED_REMINDERS

  function addScheduledReminder() {
    if (!isValidHabitTimeInput(time)) {
      onValidationError(t('habits.form.invalidScheduledReminderTime'))
      return
    }
    if (atLimit) {
      onValidationError(t('habits.form.scheduledReminderMax'))
      return
    }
    const current = scheduledReminders ?? []
    const duplicate = current.some((sr) => sr.when === when && sr.time === time)
    if (duplicate) {
      onValidationError(t('habits.form.duplicateScheduledReminder'))
      return
    }
    onSetScheduledReminders([...current, { when, time }])
    setTime('')
    setShowForm(false)
  }

  function removeScheduledReminder(index: number) {
    const current = scheduledReminders ?? []
    onSetScheduledReminders(current.filter((_, i) => i !== index))
  }

  function scheduledReminderLabel(sr: { when: ScheduledReminderWhen; time: string }): string {
    const timeDisplay = sr.time.slice(0, 5)
    if (sr.when === 'day_before') {
      return t('habits.form.scheduledReminderDayBeforeAt', { time: timeDisplay })
    }
    return t('habits.form.scheduledReminderSameDayAt', { time: timeDisplay })
  }

  return (
    <div className="space-y-3 rounded-lg border border-border-muted p-4 bg-surface-ground">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-primary" />
          <span id={scheduledReminderLabelId} className="text-sm font-medium text-text-primary">{t('habits.form.scheduledReminder')}</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={reminderEnabled}
          aria-labelledby={scheduledReminderLabelId}
          className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 ${reminderEnabled ? 'bg-primary' : 'bg-surface-elevated'}`}
          onClick={onToggleReminder}
        >
          <span className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform duration-200 ${reminderEnabled ? 'translate-x-4.5' : 'translate-x-0'}`} />
        </button>
      </div>
      {reminderEnabled && (
        <div className="space-y-3">
          {(scheduledReminders?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2">
              {(scheduledReminders ?? []).map((sr, idx) => (
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
            {!showForm && !atLimit && (
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                onClick={() => setShowForm(true)}
              >
                <Plus className="size-3.5" />
                {t('habits.form.scheduledReminderAdd')}
              </button>
            )}

            {atLimit && (
              <p className="text-xs text-text-muted">{t('habits.form.scheduledReminderMax')}</p>
            )}

            {showForm && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`flex-1 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      when === 'day_before'
                        ? 'bg-primary text-white shadow-[var(--shadow-glow-sm)]'
                        : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
                    }`}
                    onClick={() => setWhen('day_before')}
                  >
                    {t('habits.form.scheduledReminderDayBefore')}
                  </button>
                  <button
                    type="button"
                    className={`flex-1 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      when === 'same_day'
                        ? 'bg-primary text-white shadow-[var(--shadow-glow-sm)]'
                        : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
                    }`}
                    onClick={() => setWhen('same_day')}
                  >
                    {t('habits.form.scheduledReminderSameDay')}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    value={time}
                    type="text"
                    inputMode="numeric"
                    aria-label={t('habits.form.scheduledReminderTimePlaceholder')}
                    pattern="[0-9]{2}:[0-9]{2}"
                    placeholder={t('habits.form.scheduledReminderTimePlaceholder')}
                    maxLength={5}
                    className="flex-1 bg-surface text-text-primary placeholder-text-muted rounded-xl py-2 px-3 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    onChange={(e) => setTime(formatHabitTimeInput(e.target.value))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addScheduledReminder() } }}
                  />
                  <button
                    type="button"
                    className="shrink-0 px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all duration-150 disabled:opacity-40"
                    disabled={!isValidHabitTimeInput(time)}
                    onClick={addScheduledReminder}
                  >
                    {t('common.add')}
                  </button>
                  <button
                    type="button"
                    aria-label={t('common.cancel')}
                    className="shrink-0 p-2 text-text-muted hover:text-text-primary transition-colors"
                    onClick={() => { setShowForm(false); setTime('') }}
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
  )
}

// ---------------------------------------------------------------------------
// Slip alert sub-component (S3776: extracted to reduce cognitive complexity)
// ---------------------------------------------------------------------------

interface SlipAlertSectionProps {
  hasProAccess: boolean
  slipAlertEnabled: boolean
  slipAlertLabelId: string
  slipAlertDescriptionId: string
  onToggle: () => void
  t: ReturnType<typeof useTranslations>
}

function SlipAlertSection({
  hasProAccess, slipAlertEnabled, slipAlertLabelId, slipAlertDescriptionId, onToggle, t,
}: Readonly<SlipAlertSectionProps>) {
  return (
    <div className="space-y-3 rounded-lg border border-border-muted p-4 bg-surface-ground">
      {hasProAccess ? (
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
            aria-checked={slipAlertEnabled}
            aria-labelledby={slipAlertLabelId}
            aria-describedby={slipAlertDescriptionId}
            className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 shrink-0 ml-3 ${slipAlertEnabled ? 'bg-primary' : 'bg-surface-elevated'}`}
            onClick={onToggle}
          >
            <span className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform duration-200 ${slipAlertEnabled ? 'translate-x-4.5' : 'translate-x-0'}`} />
          </button>
        </div>
      ) : (
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
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Frequency type card config
// ---------------------------------------------------------------------------

const FREQUENCY_TYPE_CARDS = [
  { key: 'one-time', icon: CalendarCheck, titleKey: 'habits.form.oneTimeTask', descKey: 'habits.form.oneTimeDescription', exampleKey: 'habits.form.oneTimeExample' },
  { key: 'recurring', icon: Repeat, titleKey: 'habits.form.recurring', descKey: 'habits.form.recurringDescription', exampleKey: 'habits.form.recurringExample' },
  { key: 'flexible', icon: Shuffle, titleKey: 'habits.form.flexible', descKey: 'habits.form.flexibleDescription2', exampleKey: 'habits.form.flexibleExample2' },
  { key: 'general', icon: Infinity, titleKey: 'habits.form.general', descKey: 'habits.form.generalDescription', exampleKey: 'habits.form.generalExample' },
] as const

export function HabitFormFields({
  formHelpers,
  tags,
  selectedGoalIds,
  atGoalLimit,
  onToggleGoal,
  reminderTimes,
  onReminderTimesChange,
  onReminderEnabledChange,
  defaultExpanded = false,
  children,
}: Readonly<HabitFormFieldsProps>) {
  const t = useTranslations()
  const translate = useCallback(
    (key: string, values?: Record<string, unknown>) =>
      t(key as Parameters<typeof t>[0], values as never),
    [t],
  )
  const reminderLabelId = useId()
  const scheduledReminderLabelId = useId()
  const slipAlertLabelId = useId()
  const slipAlertDescriptionId = useId()
  const hasProAccess = useHasProAccess()
  const { showError } = useAppToast()

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

  const { register, watch, setValue } = form

  const watchedFrequencyUnit = watch('frequencyUnit') ?? null
  const watchedFrequencyQuantity = watch('frequencyQuantity') ?? null
  const watchedDays = watch('days') ?? []
  const watchedDueDate = watch('dueDate') ?? ''
  const watchedDueTime = watch('dueTime') ?? ''
  const watchedDueEndTime = watch('dueEndTime') ?? ''
  const watchedEndDate = watch('endDate') ?? ''
  const watchedIsBadHabit = watch('isBadHabit') ?? false
  const watchedReminderEnabled = watch('reminderEnabled') ?? false
  const watchedSlipAlertEnabled = watch('slipAlertEnabled') ?? false
  const watchedChecklistItems = watch('checklistItems') ?? []
  const watchedScheduledReminders = watch('scheduledReminders') ?? []
  const { tags: availableTags = [] } = useTags()
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()
  const isTagMutationPending = createTag.isPending || updateTag.isPending || deleteTag.isPending

  // Reminder label function (shared with ReminderSection)
  function reminderLabel(minutes: number): string {
    const preset = HABIT_REMINDER_PRESETS.find((p) => p.value === minutes)
    if (preset) return t(preset.key as Parameters<typeof t>[0])
    if (minutes < 60) return `${minutes} ${t('habits.form.reminderMinutes')}`
    if (minutes < 1440) {
      const h = Math.floor(minutes / 60)
      return `${h} ${t((h === 1 ? 'habits.form.reminderHour' : 'habits.form.reminderHours') as Parameters<typeof t>[0])}`
    }
    const d = Math.floor(minutes / 1440)
    return `${d} ${t((d === 1 ? 'habits.form.reminderDay' : 'habits.form.reminderDays') as Parameters<typeof t>[0])}`
  }

  const handleReminderEnabledChange = useCallback((nextEnabled: boolean) => {
    if (onReminderEnabledChange) {
      onReminderEnabledChange(nextEnabled)
      return
    }

    setValue('reminderEnabled', nextEnabled, { shouldDirty: true })
  }, [onReminderEnabledChange, setValue])

  // Progressive disclosure
  const [showAdvanced, setShowAdvanced] = useState(defaultExpanded)

  // Compute active frequency type key for card highlighting
  const activeFrequencyKey = isOneTime ? 'one-time' : isGeneral ? 'general' : isFlexible ? 'flexible' : 'recurring'

  const frequencyHandlers: Record<string, () => void> = useMemo(() => ({
    'one-time': setOneTime,
    recurring: setRecurring,
    flexible: setFlexible,
    general: setGeneral,
  }), [setOneTime, setRecurring, setFlexible, setGeneral])

  // Count filled advanced fields for the badge
  const watchedDescription = watch('description') ?? ''
  const advancedFieldCount = useMemo(() => {
    return [
      watchedDescription.length > 0,
      watchedChecklistItems.length > 0,
      watchedEndDate.length > 0,
      watchedReminderEnabled,
      selectedGoalIds.length > 0,
      watchedIsBadHabit,
    ].filter(Boolean).length
  }, [watchedDescription, watchedChecklistItems, watchedEndDate, watchedReminderEnabled, selectedGoalIds, watchedIsBadHabit])

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
      {/* ═══════════════════════════════════════════════════
         PRIMARY FIELDS -- Always visible
         ═══════════════════════════════════════════════════ */}

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

      {/* Frequency type cards (2x2 grid) */}
      <div className="space-y-1.5">
        <span className="form-label" aria-hidden="true">
          {t('habits.form.frequency')}
        </span>
        <div className="grid grid-cols-2 gap-3">
          {FREQUENCY_TYPE_CARDS.map((card) => {
            const isActive = activeFrequencyKey === card.key
            const CardIcon = card.icon
            return (
              <button
                key={card.key}
                type="button"
                onClick={frequencyHandlers[card.key]}
                className={`relative text-left p-4 rounded-[var(--radius-xl)] border-2 transition-all duration-200 ${
                  isActive
                    ? 'border-primary bg-primary/8 shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.1)]'
                    : 'border-border-muted bg-surface-elevated/50 hover:border-border hover:bg-surface-elevated'
                }`}
              >
                <div className={`size-9 rounded-[var(--radius-lg)] flex items-center justify-center mb-3 ${
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'bg-surface-elevated text-text-muted'
                }`}>
                  <CardIcon className="size-[18px]" />
                </div>
                <p className={`text-sm font-bold mb-0.5 ${
                  isActive ? 'text-text-primary' : 'text-text-secondary'
                }`}>
                  {t(card.titleKey as Parameters<typeof t>[0])}
                </p>
                <p className="text-[11px] text-text-muted leading-snug">
                  {t(card.descKey as Parameters<typeof t>[0])}
                </p>
                <p className="text-[10px] text-text-muted/60 mt-1.5 italic leading-snug">
                  {t(card.exampleKey as Parameters<typeof t>[0])}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Type-adaptive frequency sub-fields */}
      {isFlexible && (
        <p className="text-xs text-text-muted -mt-1">
          {t('habits.form.flexibleDescription', {
            n: watchedFrequencyQuantity ?? 3,
            unit: watchedFrequencyUnit
              ? t(`habits.form.unit${watchedFrequencyUnit}` as Parameters<typeof t>[0]) // NOSONAR - dynamic i18n key requires assertion
              : '',
          })}
        </p>
      )}

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
          <PillToggleRow
            containerClassName="flex flex-wrap gap-2"
            buttonClassName="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
            activeClassName="bg-primary text-white"
            inactiveClassName="bg-surface border border-border text-text-secondary hover:text-text-primary"
            options={daysList.map((day) => ({
              key: day.value,
              label: day.label,
              active: watchedDays?.includes(day.value) ?? false,
              onClick: () => toggleDay(day.value),
            }))}
          />
        </div>
      )}

      {/* Due date + Due time (combined row) */}
      {!isGeneral && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <span className="form-label" aria-hidden="true">
              {t('habits.form.dueDate')}
            </span>
            <AppDatePicker
              value={watchedDueDate}
              onChange={(val) => setValue('dueDate', val, { shouldDirty: true })}
            />
          </div>
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
          </div>
        </div>
      )}

      {/* Tags */}
      <div className="space-y-1.5">
        <span className="form-label" aria-hidden="true">
          {t('habits.form.tags')}
        </span>
        <div className="flex flex-wrap gap-2">
          {availableTags.map((tag) => (
            <HabitTagChip
              key={tag.id}
              tag={tag}
              selected={tags.selectedTagIds.includes(tag.id)}
              atLimit={!tags.selectedTagIds.includes(tag.id) && tags.atTagLimit}
              animationClassName={justToggledTagId === tag.id ? 'animate-tag-pop' : ''}
              disabled={isTagMutationPending}
              onToggle={() => handleTagToggle(tag.id)}
              editAriaLabel={t('habits.form.editTag')}
              deleteAriaLabel={t('habits.form.deleteTag')}
              onEdit={() => {
                tags.startEditTag(tag)
              }}
              onDelete={() => {
                void tags.deleteTag(tag.id, async (id) => {
                  try {
                    await deleteTag.mutateAsync(id)
                  } catch (error) {
                    showError(getFriendlyErrorMessage(error, translate, 'toast.errors.validation', 'tag'))
                    throw error
                  }
                })
              }}
            />
          ))}
          {!tags.showNewTag && !tags.atTagLimit && (
            <button
              type="button"
              className="px-3 py-1.5 rounded-full text-xs font-semibold bg-surface border border-dashed border-border text-text-muted hover:text-text-primary hover:border-primary/50 transition-all"
              disabled={isTagMutationPending}
              onClick={() => tags.setShowNewTag(true)}
            >
              + {t('habits.form.newTag')}
            </button>
          )}
        </div>
        {/* Inline tag edit */}
        {tags.editingTagId && (
          <div className="space-y-2">
            <ColorSwatches
              colors={tags.tagColors}
              activeColor={tags.editTagColor}
              onSelect={tags.setEditTagColor}
              ariaLabel={(color) => t('habits.form.selectColor', { color })}
            />
            <TagEditorRow
              value={tags.editTagName}
              disabled={isTagMutationPending}
              inputAriaLabel={t('habits.form.tagName')}
              cancelAriaLabel={t('common.cancel')}
              actionLabel={t('common.save')}
              onChange={tags.setEditTagName}
              onCommit={() => {
                const validationErrorKey = validateTagForm(tags.editTagName, tags.editTagColor)
                if (validationErrorKey) {
                  showError(translate(validationErrorKey))
                  return
                }
                void tags.saveEditTag(async (id, name, color) => {
                  try {
                    await updateTag.mutateAsync({ tagId: id, name, color })
                  } catch (error) {
                    showError(getFriendlyErrorMessage(error, translate, 'toast.errors.validation', 'tag'))
                    throw error
                  }
                })
              }}
              onCancel={tags.cancelEditTag}
            />
          </div>
        )}
        {/* Inline new tag creation */}
        {tags.showNewTag && (
          <div className="space-y-2">
            <ColorSwatches
              colors={tags.tagColors}
              activeColor={tags.newTagColor}
              onSelect={tags.setNewTagColor}
              ariaLabel={(color) => t('habits.form.selectColor', { color })}
            />
            <TagEditorRow
              value={tags.newTagName}
              placeholder={t('habits.form.tagName')}
              disabled={isTagMutationPending}
              inputAriaLabel={t('habits.form.tagName')}
              cancelAriaLabel={t('common.cancel')}
              actionLabel={t('common.add')}
              onChange={tags.setNewTagName}
              onCommit={() => {
                const validationErrorKey = validateTagForm(tags.newTagName, tags.newTagColor)
                if (validationErrorKey) {
                  showError(translate(validationErrorKey))
                  return
                }
                void tags.createAndSelectTag(async (name, color) => {
                  try {
                    const result = await createTag.mutateAsync({ name, color })
                    return result.id
                  } catch (error) {
                    showError(getFriendlyErrorMessage(error, translate, 'toast.errors.validation', 'tag'))
                    throw error
                  }
                })
              }}
              onCancel={() => tags.setShowNewTag(false)}
            />
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════
         ADVANCED FIELDS -- Behind "More options"
         ═══════════════════════════════════════════════════ */}

      <div className="border-t border-border-muted pt-1">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors w-full py-2"
        >
          <ChevronDown className={`size-4 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} />
          {t('habits.form.moreOptions' as Parameters<typeof t>[0])}
          {advancedFieldCount > 0 && (
            <span className="text-xs text-primary">{t('habits.form.moreOptionsCount' as Parameters<typeof t>[0], { count: advancedFieldCount })}</span>
          )}
        </button>
      </div>

      {/* Collapsible advanced section -- fields stay mounted for react-hook-form */}
      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${
          showAdvanced ? 'max-h-[3000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="space-y-5 pt-1">
          {/* Description */}
          <div className="space-y-1.5">
            <label htmlFor="habit-form-description" className="form-label">
              {t('habits.form.description')}
            </label>
            <textarea
              id="habit-form-description"
              placeholder={t('habits.form.descriptionPlaceholder')}
              rows={2}
              maxLength={2000}
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
                  <p className="text-xs text-text-muted">{t('habits.form.endDateHint')}</p>
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
            <ReminderSection
              reminderLabelId={reminderLabelId}
              reminderEnabled={watchedReminderEnabled}
              reminderTimes={reminderTimes}
              onReminderTimesChange={onReminderTimesChange}
              onToggleReminder={() => handleReminderEnabledChange(!watchedReminderEnabled)}
              reminderLabel={reminderLabel}
              t={t}
            />
          )}

          {/* Scheduled reminders (when no dueTime, hidden for general habits) */}
          {!watchedDueTime && !isGeneral && (
            <ScheduledReminderSection
              scheduledReminderLabelId={scheduledReminderLabelId}
              reminderEnabled={watchedReminderEnabled}
              scheduledReminders={watchedScheduledReminders}
              onToggleReminder={() => handleReminderEnabledChange(!watchedReminderEnabled)}
              onSetScheduledReminders={(reminders) => setValue('scheduledReminders', reminders, { shouldDirty: true })}
              onValidationError={showError}
              t={t}
            />
          )}

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
            <SlipAlertSection
              hasProAccess={hasProAccess}
              slipAlertEnabled={watchedSlipAlertEnabled}
              slipAlertLabelId={slipAlertLabelId}
              slipAlertDescriptionId={slipAlertDescriptionId}
              onToggle={() => setValue('slipAlertEnabled', !watchedSlipAlertEnabled, { shouldDirty: true })}
              t={t}
            />
          )}

          {/* Slot for extra fields (e.g. sub-habits) */}
          {children}
        </div>
      </div>
    </>
  )
}
