'use client'

import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { Time24, TimeFieldProps } from '@orbit/shared/contracts/forms'
import {
  DAY_PERIODS,
  detectDefaultTimeFormat,
  formatTimeParts,
  formatTimeFieldInput,
  from12Hour,
  HOURS_12,
  HOURS_24,
  MINUTES,
  padTimePart,
  parseTimeParts,
  to12Hour,
  type DayPeriod,
} from '@orbit/shared/utils'
import { Clock3, X } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { useProfile } from '@/hooks/use-profile'

interface TimeColumnProps {
  values: readonly (number | string)[]
  selected: number | string
  formatValue: (value: number | string) => string
  label: string
  onSelect: (value: number | string) => void
}

const TIME_24_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const TIME_12_PATTERN = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*([ap]m)$/i

function presentTime(value: Time24 | '', hourCycle: 'h23' | 'h12'): string {
  if (!value || hourCycle === 'h23') return value
  const [hourText, minute] = value.split(':')
  const hour = Number(hourText)
  return `${hour % 12 || 12}:${minute} ${hour < 12 ? 'am' : 'pm'}`
}

function parseTypedTime(value: string, hourCycle: 'h23' | 'h12'): Time24 | null {
  if (hourCycle === 'h23') return TIME_24_PATTERN.test(value) ? value as Time24 : null
  const match = TIME_12_PATTERN.exec(value.trim())
  if (!match) return null
  const hour12 = Number(match[1])
  const hour24 = (hour12 % 12) + (match[3]!.toLowerCase() === 'pm' ? 12 : 0)
  return `${String(hour24).padStart(2, '0')}:${match[2]}` as Time24
}

function TimeColumn({ values, selected, formatValue, label, onSelect }: Readonly<TimeColumnProps>) {
  const listRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const list = listRef.current
    const option = selectedRef.current
    if (!list || !option) return
    list.scrollTop = option.offsetTop - list.clientHeight / 2 + option.clientHeight / 2
  }, [])

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={label}
      className="h-full flex-1 snap-y overflow-y-auto px-1 [scrollbar-width:thin]"
    >
      {values.map((option) => {
        const isSelected = option === selected
        return (
          <button
            key={String(option)}
            ref={isSelected ? selectedRef : undefined}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(option)}
            className={`w-full min-h-[44px] snap-center rounded-[10px] py-2 text-center text-base transition-colors ${
              isSelected
                ? 'bg-[var(--primary)] text-[var(--fg-on-primary)]'
                : 'text-[var(--fg-1)] hover:bg-[var(--bg-elev)]'
            }`}
            style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}
          >
            {formatValue(option)}
          </button>
        )
      })}
    </div>
  )
}

interface TimeEntryProps {
  canClear: boolean
  clearLabel: string
  descriptionId: string
  disabled: boolean
  error?: string
  hint?: string
  inputId: string
  inputValue: string
  label: string
  onBlur: () => void
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  onClear?: () => void
  onFocus: () => void
  onOpenPicker: () => void
  open: boolean
  placeholder?: string
  selectTimeLabel: string
  usesNumericKeyboard: boolean
}

function TimeEntry(props: Readonly<TimeEntryProps>) {
  const {
    canClear, clearLabel, descriptionId, disabled, error, hint, inputId, inputValue,
    label, onBlur, onChange, onClear, onFocus, onOpenPicker, open, placeholder,
    selectTimeLabel, usesNumericKeyboard,
  } = props
  return (
    <>
      <label htmlFor={inputId} className="text-sm font-medium text-[var(--fg-2)]">{label}</label>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          value={inputValue}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          disabled={disabled}
          placeholder={placeholder}
          inputMode={usesNumericKeyboard ? 'numeric' : 'text'}
          data-hour-cycle={usesNumericKeyboard ? 'h23' : 'h12'}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? descriptionId : undefined}
          className={`min-h-[54px] w-full rounded-[12px] border-0 bg-[var(--bg-field)] px-4 text-base text-[var(--fg-1)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${canClear ? 'pr-24' : 'pr-12'} ${error ? 'shadow-[inset_0_0_0_2px_var(--status-bad)]' : 'shadow-[inset_0_0_0_1px_var(--border-control)] focus:shadow-[inset_0_0_0_2px_var(--primary)]'} disabled:opacity-60`}
        />
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`${label}: ${selectTimeLabel}`}
          onClick={onOpenPicker}
          className="absolute top-1/2 grid -translate-y-1/2 place-items-center rounded-full text-[var(--fg-3)] hover:bg-[var(--bg-sunk)] disabled:opacity-60"
          style={{ right: canClear ? 48 : 4, width: 44, height: 44 }}
        >
          <Clock3 size={20} strokeWidth={1.8} aria-hidden="true" />
        </button>
        {canClear ? (
          <button
            type="button"
            onClick={onClear}
            aria-label={clearLabel}
            className="absolute right-1 top-1/2 grid -translate-y-1/2 place-items-center rounded-full text-[var(--fg-3)] hover:bg-[var(--bg-sunk)]"
            style={{ width: 44, height: 44 }}
          >
            <X size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {error || hint ? (
        <span id={descriptionId} role={error ? 'alert' : undefined} className={`text-xs ${error ? 'text-[var(--status-bad-text)]' : 'text-[var(--fg-3)]'}`}>
          {error ?? hint}
        </span>
      ) : null}
    </>
  )
}

export function TimeField({
  label,
  id,
  value,
  onChange,
  onClear,
  placeholder,
  ariaLabel,
  hourCycle,
  hint,
  disabled = false,
  error,
  className = '',
}: Readonly<TimeFieldProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const generatedId = useId()
  const { profile } = useProfile()
  const uses24HourClock = profile?.uses24HourClock ?? detectDefaultTimeFormat(locale) === '24h'
  const resolvedHourCycle = hourCycle ?? (uses24HourClock ? 'h23' : 'h12')
  const resolvedLabel = label ?? ariaLabel ?? placeholder ?? t('common.selectTime')
  const inputId = id ?? generatedId
  const descriptionId = useId()
  const presentedValue = presentTime(value, resolvedHourCycle)
  const [inputDraft, setInputDraft] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [pickerDraft, setPickerDraft] = useState({ hour24: 9, minute: 0 })
  const { sheetRef, closeSheet } = useSheetHost()

  const canClear = !disabled && value.length > 0 && onClear != null
  const { hour12, period } = to12Hour(pickerDraft.hour24)

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = resolvedHourCycle === 'h23'
      ? formatTimeFieldInput(event.target.value, inputDraft ?? presentedValue)
      : event.target.value
    setInputDraft(nextValue)
    if (!nextValue) {
      onClear?.()
      return
    }
    const parsed = parseTypedTime(nextValue, resolvedHourCycle)
    if (parsed) onChange(parsed)
  }

  function openPicker() {
    const now = new Date()
    setPickerDraft(parseTimeParts(value) ?? { hour24: now.getHours(), minute: now.getMinutes() })
    setOpen(true)
  }

  function applyDraft() {
    closeSheet(() => {
      setOpen(false)
      onChange(formatTimeParts(pickerDraft) as Time24)
    })
  }

  return (
    <div className={`flex w-full flex-col gap-2 ${className}`} data-error={error ? '' : undefined}>
      <TimeEntry
        canClear={canClear}
        clearLabel={t('common.clear')}
        descriptionId={descriptionId}
        disabled={disabled}
        error={error}
        hint={hint}
        inputId={inputId}
        inputValue={inputDraft ?? presentedValue}
        label={resolvedLabel}
        onBlur={() => setInputDraft(null)}
        onChange={handleChange}
        onClear={onClear}
        onFocus={() => setInputDraft(presentedValue)}
        onOpenPicker={openPicker}
        open={open}
        placeholder={placeholder}
        selectTimeLabel={t('common.selectTime')}
        usesNumericKeyboard={resolvedHourCycle === 'h23'}
      />
      {open ? (
        <Sheet
          ref={sheetRef}
          open
          title={t('common.selectTime')}
          onClose={() => setOpen(false)}
          actions={<PillButton onClick={applyDraft}>{t('common.done')}</PillButton>}
        >
          <div className="flex gap-1" style={{ height: 220 }}>
            <TimeColumn
              values={resolvedHourCycle === 'h23' ? HOURS_24 : HOURS_12}
              selected={resolvedHourCycle === 'h23' ? pickerDraft.hour24 : hour12}
              formatValue={(option) => padTimePart(Number(option))}
              label={t('common.hours')}
              onSelect={(option) =>
                setPickerDraft((current) => ({
                  ...current,
                  hour24: resolvedHourCycle === 'h23' ? Number(option) : from12Hour(Number(option), period),
                }))
              }
            />
            <TimeColumn
              values={MINUTES}
              selected={pickerDraft.minute}
              formatValue={(option) => padTimePart(Number(option))}
              label={t('common.minutes')}
              onSelect={(option) => setPickerDraft((current) => ({ ...current, minute: Number(option) }))}
            />
            {resolvedHourCycle === 'h23' ? null : (
              <TimeColumn
                values={DAY_PERIODS}
                selected={period}
                formatValue={String}
                label={t('common.amPm')}
                onSelect={(option) =>
                  setPickerDraft((current) => ({
                    ...current,
                    hour24: from12Hour(to12Hour(current.hour24).hour12, option as DayPeriod),
                  }))
                }
              />
            )}
          </div>
        </Sheet>
      ) : null}
    </div>
  )
}
