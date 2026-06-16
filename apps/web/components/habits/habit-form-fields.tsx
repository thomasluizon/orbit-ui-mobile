'use client'

import { useState, useMemo, useCallback, useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { X, Plus, Bell, Check, ShieldAlert, PenSquare, ChevronDown, ChevronLeft, ChevronRight, CalendarCheck, Repeat, Shuffle, Infinity } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import type { FrequencyUnit, ScheduledReminderWhen } from '@orbit/shared/types/habit'
import {
  HABIT_REMINDER_PRESETS,
  HABIT_EMOJI_CATEGORIES,
  filterHabitEmojiCategories,
  formatLocaleTime,
  getFriendlyErrorMessage,
} from '@orbit/shared/utils'
import {
  MAX_HABIT_DESCRIPTION_LENGTH,
  MAX_HABIT_TITLE_LENGTH,
  MAX_SCHEDULED_REMINDERS,
  MAX_TAG_NAME_LENGTH,
  validateScheduledReminders,
  validateTagForm,
} from '@orbit/shared/validation'
import { HabitChecklist } from './habit-checklist'
import { ChecklistTemplates } from './checklist-templates'
import { GoalLinkingField } from './goal-linking-field'
import { AppDatePicker } from '@/components/ui/app-date-picker'
import { AppTimePicker } from '@/components/ui/app-time-picker'
import { AppSelect } from '@/components/ui/app-select'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/settings-row'
import { useAppToast } from '@/hooks/use-app-toast'
import { useOverlayEscape } from '@/hooks/use-overlay-escape'
import type { TagSelectionState } from '@/hooks/use-tag-selection'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import { useHasProAccess } from '@/hooks/use-profile'
import { useCreateTag, useDeleteTag, useTags, useUpdateTag } from '@/hooks/use-tags'

interface HabitFormFieldsProps {
  formHelpers: HabitFormHelpers
  titleInputRef?: RefObject<HTMLInputElement | null>
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
    <div className="flex flex-wrap gap-1.5">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={ariaLabel(color)}
          aria-pressed={activeColor === color}
          className="size-5 rounded-full transition-transform hover:scale-110"
          style={{
            backgroundColor: color,
            boxShadow:
              activeColor === color ? 'inset 0 0 0 2px var(--primary)' : undefined,
          }}
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
        maxLength={MAX_TAG_NAME_LENGTH}
        disabled={disabled}
        className="flex-1 min-w-0 bg-[var(--bg-field)] text-[var(--fg-1)] placeholder:text-[var(--fg-3)] rounded-[12px] py-2.5 px-3.5 text-[13px] shadow-[inset_0_0_0_1px_var(--hairline)] border-0 focus:outline-none focus:shadow-[inset_0_0_0_2px_var(--primary)] transition-[box-shadow] duration-[var(--dur-fast)]"
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
        className="shrink-0 rounded-full bg-[var(--primary)] text-[var(--fg-on-primary)] hover:bg-[var(--primary-pressed)] transition-[background-color,opacity] duration-150 disabled:opacity-40"
        style={{
          padding: '9px 14px',
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          fontWeight: 500,
        }}
        disabled={disabled}
        onClick={onCommit}
      >
        {actionLabel}
      </button>
      <button
        type="button"
        aria-label={cancelAriaLabel}
        className="shrink-0 grid size-10 place-items-center rounded-full text-[var(--fg-3)] hover:text-[var(--fg-1)] transition-colors duration-150"
        disabled={disabled}
        onClick={onCancel}
      >
        <X size={16} strokeWidth={1.8} aria-hidden="true" />
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

interface HabitEmojiSelectorProps {
  selectedEmoji: string
  onSelect: (emoji: string) => void
}

function HabitEmojiSelector({ selectedEmoji, onSelect }: Readonly<HabitEmojiSelectorProps>) {
  const t = useTranslations()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const searchedCategories = useMemo(() => filterHabitEmojiCategories(query), [query])
  const filteredCategories = useMemo(
    () => selectedCategoryId
      ? searchedCategories.filter((category) => category.id === selectedCategoryId)
      : searchedCategories,
    [searchedCategories, selectedCategoryId],
  )

  const closePicker = useCallback(() => {
    setPickerOpen(false)
    setQuery('')
    setSelectedCategoryId(null)
  }, [])

  useOverlayEscape({ open: pickerOpen, onDismiss: closePicker })

  function handleSelectEmoji(emoji: string) {
    onSelect(emoji)
    closePicker()
  }

  function handleSelectCategory(categoryId: string) {
    setSelectedCategoryId((current) => current === categoryId ? null : categoryId)
  }

  return (
    <>
      <button
        type="button"
        className="grid shrink-0 cursor-pointer place-items-center border-0 transition-[box-shadow,background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:shadow-[inset_0_0_0_1px_var(--hairline-strong)] active:scale-[0.96] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--primary)]"
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          fontSize: 26,
          background: 'color-mix(in srgb, var(--fg-1) 6%, transparent)',
        }}
        onClick={() => setPickerOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={pickerOpen}
        aria-label={t('habits.form.emojiOpenPicker')}
      >
        {selectedEmoji || <Plus size={22} strokeWidth={1.8} className="text-[var(--fg-3)]" aria-hidden="true" />}
      </button>

      {pickerOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 p-4"
          role="presentation"
          onMouseDown={closePicker}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('habits.form.emojiPickerTitle')}
            className="w-full max-w-xl overflow-hidden rounded-[20px] bg-[var(--bg-sheet)] shadow-[var(--shadow-3),inset_0_0_0_1px_var(--hairline)]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--hairline)] px-4 py-3">
              <div className="flex items-center gap-3">
                <span
                  className="grid place-items-center rounded-[12px] bg-[var(--bg-elev)] text-xl"
                  style={{ width: 40, height: 40 }}
                >
                  {selectedEmoji || <Plus size={16} strokeWidth={1.8} className="text-[var(--fg-3)]" aria-hidden="true" />}
                </span>
                <div>
                  <h3
                    className="text-[var(--fg-1)]"
                    style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 500 }}
                  >
                    {t('habits.form.emojiPickerTitle')}
                  </h3>
                  <p className="text-xs text-[var(--fg-3)]">{t('habits.form.emojiDescription')}</p>
                </div>
              </div>
              <button
                type="button"
                className="grid size-10 place-items-center rounded-full text-[var(--fg-2)] hover:text-[var(--fg-1)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--primary)] transition-colors duration-150"
                onClick={closePicker}
                aria-label={t('common.close')}
              >
                <X size={20} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-3 p-4">
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('habits.form.emojiSearchPlaceholder')}
                className="form-input h-11 py-2"
              />
              {selectedEmoji && (
                <button
                  type="button"
                  className="chip"
                  onClick={() => handleSelectEmoji('')}
                >
                  <X size={14} strokeWidth={1.8} aria-hidden="true" />
                  {t('habits.form.emojiRemove')}
                </button>
              )}
              <div className="flex gap-2 overflow-x-auto pb-1" aria-label={t('habits.form.emojiCategories')}>
                {HABIT_EMOJI_CATEGORIES.map((category) => {
                  const selected = selectedCategoryId === category.id
                  return (
                    <button
                      key={category.id}
                      type="button"
                      aria-pressed={selected}
                      className={`chip ${selected ? 'chip-active' : ''}`}
                      onClick={() => handleSelectCategory(category.id)}
                    >
                      {t(category.labelKey)}
                    </button>
                  )
                })}
              </div>

              <div className="max-h-[min(420px,55vh)] overflow-y-auto pr-1">
                {filteredCategories.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[var(--fg-3)]">{t('habits.form.emojiPickerEmpty')}</p>
                ) : filteredCategories.map((category) => (
                  <section key={category.id} id={`habit-emoji-${category.id}`} className="scroll-mt-3 pb-4">
                    <h4
                      className="mb-2 text-[var(--fg-3)]"
                      style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500 }}
                    >
                      {t(category.labelKey)}
                    </h4>
                    <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-9" role="listbox" aria-label={t(category.labelKey)}>
                      {category.emojis.map((emoji) => {
                        const isSelected = selectedEmoji === emoji
                        return (
                          <button
                            key={`${category.id}-${emoji}`}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            aria-label={`${t('habits.form.emoji')}: ${emoji}`}
                            className={`grid place-items-center rounded-[12px] text-xl transition-[background-color,box-shadow] duration-150 ${
                              isSelected
                                ? 'bg-[rgba(var(--primary-rgb),0.10)] shadow-[inset_0_0_0_2px_var(--primary)]'
                                : 'hover:bg-[var(--bg-elev)]'
                            }`}
                            style={{ width: 44, height: 44 }}
                            onClick={() => handleSelectEmoji(emoji)}
                          >
                            {emoji}
                          </button>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
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
      className={`flex items-center rounded-full transition-[background-color,box-shadow,color,opacity,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] ${
        selected
          ? 'text-white'
          : 'bg-[var(--bg-elev)] shadow-[inset_0_0_0_1px_var(--hairline)] text-[var(--fg-2)] hover:bg-[var(--bg-elev-2)] hover:text-[var(--fg-1)]'
      } ${
        !selected && atLimit
          ? 'opacity-30 pointer-events-none'
          : ''
      } ${animationClassName}`}
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
        fontWeight: 500,
        backgroundColor: selected ? tag.color : undefined,
      }}
    >
      <button
        type="button"
        className="pl-3 pr-1 py-2 flex items-center gap-1.5 hover:opacity-80"
        aria-pressed={selected}
        onClick={onToggle}
      >
        {!selected && (
          <span className="size-2 rounded-full" style={{ backgroundColor: tag.color }} />
        )}
        {tag.name}
      </button>
      <button
        type="button"
        className={`pl-0.5 py-2 hover:opacity-60 transition-opacity ${
          selected ? 'text-white/70' : 'text-[var(--fg-3)]'
        }`}
        aria-label={editAriaLabel}
        disabled={disabled}
        onClick={onEdit}
      >
        <PenSquare size={13} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`pr-2.5 pl-1 py-2 hover:opacity-60 transition-opacity ${
          selected ? 'text-white/70' : 'text-[var(--fg-3)]'
        }`}
        aria-label={deleteAriaLabel}
        disabled={disabled}
        onClick={onDelete}
      >
        <X size={13} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  )
}

interface ReminderSectionProps {
  reminderEnabled: boolean
  reminderTimes: number[]
  onReminderTimesChange: (times: number[]) => void
  onToggleReminder: () => void
  reminderLabel: (minutes: number) => string
  t: ReturnType<typeof useTranslations>
}

function ReminderSection({
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
    <div className="space-y-3 rounded-[14px] bg-[var(--bg-field)] p-4 shadow-[inset_0_0_0_1px_var(--hairline)]">
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
        <div className="space-y-2">
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
                    className="w-full text-left px-3.5 py-2.5 rounded-[10px] text-[15px] text-[var(--fg-1)] hover:bg-[var(--bg-elev)] transition-colors duration-150"
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
                      className="w-20 bg-[var(--bg-field)] text-[var(--fg-1)] placeholder:text-[var(--fg-3)] rounded-[12px] py-2 px-3 text-sm border-0 shadow-[inset_0_0_0_1px_var(--hairline)] focus:outline-none focus:shadow-[inset_0_0_0_2px_var(--primary)] transition-[box-shadow] duration-[var(--dur-fast)]"
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
                      className="shrink-0 grid size-9 place-items-center rounded-full bg-[var(--primary)] text-[var(--fg-on-primary)] hover:bg-[var(--primary-pressed)] transition-colors duration-150"
                      onClick={addCustomReminder}
                    >
                      <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  className="w-full text-left px-3.5 py-2.5 rounded-[10px] text-[15px] text-[var(--primary)] font-medium hover:bg-[var(--bg-elev)] transition-colors duration-150"
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

interface ScheduledReminderSectionProps {
  reminderEnabled: boolean
  scheduledReminders: Array<{ when: ScheduledReminderWhen; time: string }> | undefined
  onToggleReminder: () => void
  onSetScheduledReminders: (reminders: Array<{ when: ScheduledReminderWhen; time: string }>) => void
  onValidationError: (message: string) => void
  t: ReturnType<typeof useTranslations>
}

function ScheduledReminderSection({
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
                    className="form-input flex-1"
                    onChange={setTime}
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded-full bg-[var(--primary)] text-[var(--fg-on-primary)] hover:bg-[var(--primary-pressed)] transition-[background-color,opacity] duration-150 disabled:opacity-40"
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
                    className="shrink-0 grid size-10 place-items-center rounded-full text-[var(--fg-3)] hover:text-[var(--fg-1)] transition-colors duration-150"
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

interface SlipAlertSectionProps {
  hasProAccess: boolean
  slipAlertEnabled: boolean
  onToggle: () => void
  t: ReturnType<typeof useTranslations>
}

function SlipAlertSection({
  hasProAccess, slipAlertEnabled, onToggle, t,
}: Readonly<SlipAlertSectionProps>) {
  const router = useRouter()

  return (
    <div className="space-y-3 rounded-[14px] bg-[var(--bg-field)] p-4 shadow-[inset_0_0_0_1px_var(--hairline)]">
      {hasProAccess ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2.5">
              <ShieldAlert size={20} strokeWidth={1.8} className="text-[var(--fg-2)]" aria-hidden="true" />
              <span
                className="text-[var(--fg-1)]"
                style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500 }}
              >
                {t('habits.form.slipAlert')}
              </span>
            </div>
            <span className="text-[13px] text-[var(--fg-3)]" style={{ marginLeft: 30 }}>
              {t('habits.form.slipAlertDescription')}
            </span>
          </div>
          <Switch
            on={slipAlertEnabled}
            onToggle={onToggle}
            ariaLabel={t('habits.form.slipAlert')}
          />
        </div>
      ) : (
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={() => router.push('/upgrade')}
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2.5">
              <ShieldAlert size={20} strokeWidth={1.8} className="text-[var(--fg-3)]" aria-hidden="true" />
              <span
                className="text-[var(--fg-3)]"
                style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500 }}
              >
                {t('habits.form.slipAlert')}
              </span>
              <Badge tone="soft">{t('common.proBadge')}</Badge>
            </div>
            <span className="text-[13px] text-[var(--fg-3)]" style={{ marginLeft: 30 }}>
              {t('habits.form.slipAlertDescription')}
            </span>
          </div>
          <span
            aria-hidden="true"
            className="inline-flex shrink-0 items-center rounded-full opacity-50"
            style={{
              width: 48,
              height: 28,
              padding: 3,
              background: 'color-mix(in srgb, var(--fg-1) 16%, transparent)',
            }}
          >
            <span
              className="rounded-full"
              style={{
                width: 22,
                height: 22,
                background: 'var(--fg-on-primary)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
              }}
            />
          </span>
        </button>
      )}
    </div>
  )
}

const FREQUENCY_TYPE_CARDS = [
  { key: 'one-time', icon: CalendarCheck, titleKey: 'habits.form.oneTimeTask', descKey: 'habits.form.oneTimeDescription', exampleKey: 'habits.form.oneTimeExample' },
  { key: 'recurring', icon: Repeat, titleKey: 'habits.form.recurring', descKey: 'habits.form.recurringDescription', exampleKey: 'habits.form.recurringExample' },
  { key: 'flexible', icon: Shuffle, titleKey: 'habits.form.flexible', descKey: 'habits.form.flexibleDescription2', exampleKey: 'habits.form.flexibleExample2' },
  { key: 'general', icon: Infinity, titleKey: 'habits.form.general', descKey: 'habits.form.generalDescription', exampleKey: 'habits.form.generalExample' },
] as const

export function HabitFormFields({
  formHelpers,
  titleInputRef,
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
    (key: string, values?: Record<string, string | number | Date>) =>
      t(key, values),
    [t],
  )
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
  } = formHelpers

  const { register, watch, setValue, formState: { errors } } = form
  const titleRegister = register('title')

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
  const watchedChecklistItemsRaw = watch('checklistItems')
  const watchedChecklistItems = useMemo(() => watchedChecklistItemsRaw ?? [], [watchedChecklistItemsRaw])
  const watchedScheduledReminders = watch('scheduledReminders') ?? []
  const { tags: availableTags = [] } = useTags()
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()
  const isTagMutationPending = createTag.isPending || updateTag.isPending || deleteTag.isPending

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

  useEffect(() => {
    if (!watchedDueTime && watchedDueEndTime) {
      setValue('dueEndTime', '', { shouldDirty: true })
    }
  }, [watchedDueTime, watchedDueEndTime, setValue])

  const handleReminderEnabledChange = useCallback((nextEnabled: boolean) => {
    if (onReminderEnabledChange) {
      onReminderEnabledChange(nextEnabled)
      return
    }

    setValue('reminderEnabled', nextEnabled, { shouldDirty: true })
  }, [onReminderEnabledChange, setValue])

  const [showAdvanced, setShowAdvanced] = useState(defaultExpanded)

  const activeFrequencyKey = (() => {
    if (isOneTime) return 'one-time'
    if (isGeneral) return 'general'
    if (isFlexible) return 'flexible'
    return 'recurring'
  })()

  const frequencyHandlers: Record<string, () => void> = useMemo(() => ({
    'one-time': setOneTime,
    recurring: setRecurring,
    flexible: setFlexible,
    general: setGeneral,
  }), [setOneTime, setRecurring, setFlexible, setGeneral])

  const frequencyTrackRef = useRef<HTMLDivElement>(null)
  const hasPositionedFrequencyRef = useRef(false)
  const activeFrequencyIndex = FREQUENCY_TYPE_CARDS.findIndex((card) => card.key === activeFrequencyKey)

  useEffect(() => {
    const track = frequencyTrackRef.current
    if (!track) return

    let frame = 0
    const positionToActive = () => {
      const width = track.clientWidth
      if (width === 0) {
        frame = requestAnimationFrame(positionToActive)
        return
      }
      const target = activeFrequencyIndex * width
      if (Math.abs(track.scrollLeft - target) > 1) {
        track.scrollTo({
          left: target,
          behavior: hasPositionedFrequencyRef.current ? 'smooth' : 'auto',
        })
      }
      hasPositionedFrequencyRef.current = true
    }

    positionToActive()
    return () => {
      if (frame) cancelAnimationFrame(frame)
    }
  }, [activeFrequencyIndex])

  function handleFrequencyScroll() {
    const track = frequencyTrackRef.current
    if (!track || track.clientWidth === 0) return
    const index = Math.round(track.scrollLeft / track.clientWidth)
    const nextCard = FREQUENCY_TYPE_CARDS[index]
    if (nextCard && nextCard.key !== activeFrequencyKey) {
      frequencyHandlers[nextCard.key]?.()
    }
  }

  function goToFrequencyIndex(index: number) {
    const nextCard = FREQUENCY_TYPE_CARDS[index]
    if (nextCard) {
      frequencyHandlers[nextCard.key]?.()
    }
  }

  const watchedDescription = watch('description') ?? ''
  const watchedEmoji = watch('emoji') ?? ''
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
      <div className="space-y-2">
        <label htmlFor="habit-form-title" className="form-label">
          {t('habits.form.title')}
        </label>
        <div className="flex items-end" style={{ gap: 12 }}>
          <HabitEmojiSelector
            selectedEmoji={watchedEmoji}
            onSelect={(emoji) => setValue('emoji', emoji, { shouldDirty: true })}
          />
          <input
            id="habit-form-title"
            type="text"
            maxLength={MAX_HABIT_TITLE_LENGTH}
            placeholder={t('habits.form.titlePlaceholder')}
            className="form-input flex-1 min-w-0"
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? 'habit-form-title-error' : undefined}
            {...titleRegister}
            ref={(element) => {
              titleRegister.ref(element)
              if (titleInputRef) {
                titleInputRef.current = element
              }
            }}
          />
        </div>
        {errors.title && (
          <p id="habit-form-title-error" className="text-xs text-[var(--status-bad)] mt-1" role="alert">
            {errors.title.message}
          </p>
        )}
      </div>

      <div className="space-y-2" role="radiogroup" aria-labelledby="habit-form-frequency-label">
        <span id="habit-form-frequency-label" className="form-label">
          {t('habits.form.frequency')}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label={t('common.previous')}
            disabled={activeFrequencyIndex === 0}
            onClick={() => goToFrequencyIndex(activeFrequencyIndex - 1)}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--bg-elev)] text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] transition-opacity duration-150 hover:text-[var(--fg-1)] disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
          </button>
          <div
            ref={frequencyTrackRef}
            onScroll={handleFrequencyScroll}
            className="flex min-w-0 flex-1 snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {FREQUENCY_TYPE_CARDS.map((card) => {
              const isActive = activeFrequencyKey === card.key
              const Icon = card.icon
              return (
                <div key={card.key} className="w-full shrink-0 snap-center px-1">
                  <button
                    type="button"
                    aria-pressed={isActive}
                    onClick={frequencyHandlers[card.key]}
                    className="appearance-none cursor-pointer text-left w-full rounded-[18px] border-0 bg-[rgba(var(--primary-rgb),0.10)] shadow-[inset_0_0_0_1.5px_var(--primary)] transition-transform duration-[var(--dur-fast)] ease-[var(--ease-standard)] active:scale-[0.99]"
                    style={{ padding: '14px 16px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span
                        className="grid shrink-0 place-items-center"
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 12,
                          background: 'color-mix(in srgb, var(--fg-1) 6%, transparent)',
                        }}
                      >
                        <Icon
                          size={22}
                          strokeWidth={2.2}
                          aria-hidden="true"
                          style={{ color: 'var(--primary)' }}
                        />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 3 }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-sans)',
                            fontSize: 16,
                            fontWeight: 500,
                            color: 'var(--fg-1)',
                          }}
                        >
                          {t(card.titleKey as Parameters<typeof t>[0])}
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--font-sans)',
                            fontSize: 13,
                            color: 'var(--fg-3)',
                            lineHeight: 1.45,
                          }}
                        >
                          {t(card.descKey as Parameters<typeof t>[0])}
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--font-sans)',
                            fontSize: 12,
                            color: 'var(--fg-3)',
                            lineHeight: 1.4,
                          }}
                        >
                          {t(card.exampleKey as Parameters<typeof t>[0])}
                        </span>
                      </span>
                    </div>
                  </button>
                </div>
              )
            })}
          </div>

          <button
            type="button"
            aria-label={t('common.next')}
            disabled={activeFrequencyIndex === FREQUENCY_TYPE_CARDS.length - 1}
            onClick={() => goToFrequencyIndex(activeFrequencyIndex + 1)}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--bg-elev)] text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] transition-opacity duration-150 hover:text-[var(--fg-1)] disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-center justify-center gap-1.5 pt-2.5">
          {FREQUENCY_TYPE_CARDS.map((card, index) => (
            <span
              key={card.key}
              aria-hidden="true"
              className={`h-1.5 rounded-full transition-[width,background-color] duration-200 ${
                index === activeFrequencyIndex
                  ? 'w-4 bg-[var(--primary)]'
                  : 'w-1.5 bg-[var(--hairline-strong)]'
              }`}
            />
          ))}
        </div>
      </div>

      {isFlexible && (
        <p className="text-[13px] text-[var(--fg-3)]">
          {t('habits.form.flexibleDescription', {
            n: watchedFrequencyQuantity ?? 3,
            unit: watchedFrequencyUnit
              ? t(`habits.form.unit${watchedFrequencyUnit}` as Parameters<typeof t>[0])
              : '',
          })}
        </p>
      )}

      {!isOneTime && !isGeneral && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
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
          <div className="space-y-2">
            <span id="habit-form-unit-label" className="form-label">
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

      {showDayPicker && !isGeneral && (
        <div className="space-y-2" role="group" aria-labelledby="habit-form-active-days-label">
          <span id="habit-form-active-days-label" className="form-label">
            {t('habits.form.activeDays')}
          </span>
          <PillToggleRow
            containerClassName="flex gap-2"
            buttonClassName="flex-1 inline-flex h-[42px] items-center justify-center rounded-[12px] text-[14px] font-medium transition-[background-color,color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] active:scale-[0.96]"
            activeClassName="bg-[var(--primary)] text-[var(--fg-on-primary)]"
            inactiveClassName="bg-[var(--bg-field)] text-[var(--fg-3)] hover:bg-[var(--bg-elev-2)] hover:text-[var(--fg-1)]"
            options={daysList.map((day) => ({
              key: day.value,
              label: day.label,
              active: watchedDays?.includes(day.value) ?? false,
              onClick: () => toggleDay(day.value),
            }))}
          />
        </div>
      )}

      {!isGeneral && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <span id="habit-form-due-date-label" className="form-label">
              {t('habits.form.dueDate')}
            </span>
            <AppDatePicker
              value={watchedDueDate}
              onChange={(val) => setValue('dueDate', val, { shouldDirty: true })}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="habit-form-due-time" className="form-label">
              {t('habits.form.dueTime')}
            </label>
            <AppTimePicker
              id="habit-form-due-time"
              placeholder={t('habits.form.scheduledReminderTimePlaceholder')}
              value={watchedDueTime}
              ariaLabel={t('habits.form.dueTime')}
              onChange={(nextValue) => setValue('dueTime', nextValue, { shouldDirty: true })}
              onClear={() => {
                setValue('dueTime', '', { shouldDirty: true })
                setValue('dueEndTime', '', { shouldDirty: true })
              }}
            />
          </div>
        </div>
      )}

      <div className="space-y-2" role="group" aria-labelledby="habit-form-tags-label">
        <span id="habit-form-tags-label" className="form-label">
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
                  } catch (error: unknown) {
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
              className="chip"
              disabled={isTagMutationPending}
              onClick={() => tags.setShowNewTag(true)}
            >
              <Plus size={14} strokeWidth={2} aria-hidden="true" />
              {t('habits.form.newTag')}
            </button>
          )}
        </div>
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
                  } catch (error: unknown) {
                    showError(getFriendlyErrorMessage(error, translate, 'toast.errors.validation', 'tag'))
                    throw error
                  }
                })
              }}
              onCancel={tags.cancelEditTag}
            />
          </div>
        )}
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
                  } catch (error: unknown) {
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

      <div className="border-t border-[var(--hairline)] pt-4 mt-2">
        <button
          type="button"
          aria-expanded={showAdvanced}
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm font-medium text-[var(--fg-2)] hover:text-[var(--fg-1)] transition-colors w-full py-3"
        >
          <ChevronDown className={`size-4 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} />
          {t('habits.form.moreOptions' as Parameters<typeof t>[0])}
          {advancedFieldCount > 0 && (
            <span className="text-xs text-[var(--primary)]">{t('habits.form.moreOptionsCount' as Parameters<typeof t>[0], { count: advancedFieldCount })}</span>
          )}
        </button>
      </div>

      <div className={`collapsible ${showAdvanced ? 'is-open' : ''}`}>
        <div className="space-y-6 pt-2">
          <div className="space-y-2">
            <label htmlFor="habit-form-description" className="form-label">
              {t('habits.form.description')}
            </label>
            <textarea
              id="habit-form-description"
              placeholder={t('habits.form.descriptionPlaceholder')}
              rows={2}
              maxLength={MAX_HABIT_DESCRIPTION_LENGTH}
              className="form-input resize-none"
              {...register('description')}
            />
          </div>

          <div className="space-y-2" role="group" aria-labelledby="habit-form-checklist-label">
            <span id="habit-form-checklist-label" className="form-label">
              {t('habits.form.checklist')}
            </span>
            <HabitChecklist
              items={watchedChecklistItems ?? []}
              editable
              onItemsChange={(items) => setValue('checklistItems', items, { shouldDirty: true })}
            />
            <div className="mt-4">
              <ChecklistTemplates
                items={watchedChecklistItems ?? []}
                onLoad={(items) => setValue('checklistItems', items, { shouldDirty: true })}
              />
            </div>
          </div>

          {watchedDueTime && !isGeneral && (
            <div className="space-y-2">
              <label htmlFor="habit-form-due-end-time" className="form-label">
                {t('habits.form.dueEndTime')}
              </label>
              <AppTimePicker
                id="habit-form-due-end-time"
                placeholder={t('habits.form.scheduledReminderTimePlaceholder')}
                value={watchedDueEndTime}
                ariaLabel={t('habits.form.dueEndTime')}
                onChange={(nextValue) => setValue('dueEndTime', nextValue, { shouldDirty: true })}
                onClear={() => setValue('dueEndTime', '', { shouldDirty: true })}
              />
            </div>
          )}

          {showEndDate && (
            <div className="space-y-1.5">
              {watchedEndDate ? (
                <div className="space-y-2">
                  <span id="habit-form-end-date-label" className="form-label">
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
                      className="shrink-0 p-2 text-[var(--fg-3)] hover:text-[var(--status-bad)] hover:bg-[var(--status-bad)]/10 transition-colors rounded-full"
                      onClick={() => setValue('endDate', '', { shouldDirty: true })}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <p className="text-xs text-[var(--fg-3)]">{t('habits.form.endDateHint')}</p>
                </div>
              ) : (
                <button
                  type="button"
                  className="chip"
                  onClick={() =>
                    setValue('endDate', watchedDueDate || '', {
                      shouldDirty: true,
                    })
                  }
                >
                  <Plus size={14} strokeWidth={2} aria-hidden="true" />
                  {t('habits.form.addEndDate')}
                </button>
              )}
            </div>
          )}

          {watchedDueTime && !isGeneral && (
            <ReminderSection
              reminderEnabled={watchedReminderEnabled}
              reminderTimes={reminderTimes}
              onReminderTimesChange={onReminderTimesChange}
              onToggleReminder={() => handleReminderEnabledChange(!watchedReminderEnabled)}
              reminderLabel={reminderLabel}
              t={t}
            />
          )}

          {!watchedDueTime && !isGeneral && (
            <ScheduledReminderSection
              reminderEnabled={watchedReminderEnabled}
              scheduledReminders={watchedScheduledReminders}
              onToggleReminder={() => handleReminderEnabledChange(!watchedReminderEnabled)}
              onSetScheduledReminders={(reminders) => setValue('scheduledReminders', reminders, { shouldDirty: true })}
              onValidationError={showError}
              t={t}
            />
          )}

          {hasProAccess && (
            <GoalLinkingField
              selectedGoalIds={selectedGoalIds}
              atGoalLimit={atGoalLimit}
              onToggleGoal={onToggleGoal}
            />
          )}

          {!isGeneral && (
            <label className="flex items-center gap-3 cursor-pointer py-2">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={watchedIsBadHabit}
                onChange={(e) => setValue('isBadHabit', e.target.checked, { shouldDirty: true })}
              />
              <span
                aria-hidden="true"
                className="flex items-center justify-center transition-[background-color,box-shadow] duration-[var(--dur-fast)] peer-focus-visible:shadow-[inset_0_0_0_2px_var(--fg-3),0_0_0_2px_var(--primary)]"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: watchedIsBadHabit ? 'var(--primary)' : 'transparent',
                  boxShadow: watchedIsBadHabit ? 'none' : 'inset 0 0 0 2px var(--fg-3)',
                }}
              >
                {watchedIsBadHabit && (
                  <Check size={15} strokeWidth={3} color="var(--fg-on-primary)" />
                )}
              </span>
              <span className="text-sm text-[var(--fg-1)]">{t('habits.form.badHabitLabel')}</span>
            </label>
          )}

          {watchedIsBadHabit && (
            <SlipAlertSection
              hasProAccess={hasProAccess}
              slipAlertEnabled={watchedSlipAlertEnabled}
              onToggle={() => setValue('slipAlertEnabled', !watchedSlipAlertEnabled, { shouldDirty: true })}
              t={t}
            />
          )}

          {children}
        </div>
      </div>
    </>
  )
}
