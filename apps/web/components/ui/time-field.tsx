'use client'

import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'

import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { TimeFieldProps } from '@orbit/shared/contracts/forms'
import {
  DAY_PERIODS,
  resolveHourCycle,
  changeTimeFieldInput,
  commitTimeFieldPickerDraft,
  initialTimeFieldPickerDraft,
  presentTimeFieldValue,
  selectTimeFieldHour,
  selectTimeFieldMinute,
  selectTimeFieldPeriod,
  HOURS_12,
  HOURS_24,
  MINUTES,
  padTimePart,
  to12Hour,
  type DayPeriod,
} from '@orbit/shared/utils'
import { Clock3, X } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'
import { RadioGroup, useRadioGroupItem } from '@/components/ui/radio-row'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { useProfile } from '@/hooks/use-profile'
import { revealFocusedControl } from '@/lib/focus-scroll'

interface TimeColumnProps {
  values: readonly (number | string)[]
  selected: number | string
  formatValue: (value: number | string) => string
  label: string
  onSelect: (value: number | string) => void
}

function TimeOption({
  formattedValue,
  selected,
  onSelect,
}: Readonly<{
  formattedValue: string
  selected: boolean
  onSelect: () => void
}>) {
  const { elementRef, onActivate, onKeyDown, tabIndex } = useRadioGroupItem({
    disabled: false,
    onSelect,
    selected,
  })

  return (
    <button
      ref={elementRef}
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={tabIndex}
      onClick={onActivate}
      onKeyDown={onKeyDown}
      className={`w-full min-h-[var(--touch-min)] rounded-[12px] py-2 text-center text-base transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] ${
        selected
          ? 'bg-[var(--bg-hover)] text-[var(--fg-1)] shadow-[inset_0_0_0_2px_var(--primary)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)]'
          : 'text-[var(--fg-1)] hover:bg-[var(--bg-hover)]'
      }`}
      style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}
    >
      {formattedValue}
    </button>
  )
}

function TimeColumn({ values, selected, formatValue, label, onSelect }: Readonly<TimeColumnProps>) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const revealSelected = () => {
      const option = list.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')
      if (!option) return
      list.scrollTop = option.offsetTop - list.clientHeight / 2 + option.clientHeight / 2
    }
    revealSelected()
    const observer = new ResizeObserver(revealSelected)
    observer.observe(list)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={listRef} data-focus-inset="" onFocusCapture={revealFocusedControl} className="relative h-full min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-1 [scrollbar-width:thin]">
      <RadioGroup aria-label={label}>
        {values.map((option) => (
          <TimeOption
            key={String(option)}
            formattedValue={formatValue(option)}
            selected={option === selected}
            onSelect={() => onSelect(option)}
          />
        ))}
      </RadioGroup>
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
          data-focus-perimeter=""
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? descriptionId : undefined}
          className={`orbit-field-hover min-h-[54px] w-full rounded-[12px] border-0 bg-[var(--bg-field)] px-4 text-base text-[var(--fg-1)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--primary)] forced-colors:border-2 forced-colors:border-[CanvasText] forced-colors:focus-visible:border-[Highlight] ${canClear ? 'pr-[calc(2*var(--touch-min)+8px)]' : 'pr-[calc(var(--touch-min)+8px)]'} ${error ? 'shadow-[inset_0_0_0_2px_var(--status-bad)]' : 'shadow-[inset_0_0_0_1px_var(--border-control)]'} disabled:opacity-60`}
        />
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`${label}: ${selectTimeLabel}`}
          onClick={onOpenPicker}
          className="absolute top-1/2 grid -translate-y-1/2 place-items-center rounded-full text-[var(--fg-3)] hover:bg-[var(--bg-sunk)] disabled:opacity-60 transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]"
          style={{ right: canClear ? TOUCH_TARGET_MIN + 4 : 4, width: TOUCH_TARGET_MIN, height: TOUCH_TARGET_MIN }}
        >
          <Clock3 size={20} strokeWidth={1.8} aria-hidden="true" />
        </button>
        {canClear ? (
          <button
            type="button"
            onClick={onClear}
            aria-label={clearLabel}
            className="absolute right-1 top-1/2 grid -translate-y-1/2 place-items-center rounded-full text-[var(--fg-3)] hover:bg-[var(--bg-sunk)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]"
            style={{ width: TOUCH_TARGET_MIN, height: TOUCH_TARGET_MIN }}
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
  commitTypedClearOnBlur = false,
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
  const resolvedProfileHourCycle = resolveHourCycle(profile?.uses24HourClock, locale)
  const resolvedHourCycle = hourCycle ?? resolvedProfileHourCycle
  const resolvedLabel = label ?? ariaLabel ?? placeholder ?? t('common.selectTime')
  const inputId = id ?? generatedId
  const descriptionId = useId()
  const presentedValue = presentTimeFieldValue(value, resolvedHourCycle)
  const [inputDraft, setInputDraft] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [pickerDraft, setPickerDraft] = useState({ hour24: 9, minute: 0 })
  const { sheetRef, closeSheet } = useSheetHost()

  const canClear = !disabled && value.length > 0 && onClear != null
  const { hour12, period } = to12Hour(pickerDraft.hour24)

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const change = changeTimeFieldInput(event.target.value, inputDraft ?? presentedValue, resolvedHourCycle)
    setInputDraft(change.draft)
    if (change.clear) {
      if (!commitTypedClearOnBlur) onClear?.()
      return
    }
    if (change.parsed) onChange(change.parsed)
  }

  function openPicker() {
    const now = new Date()
    setPickerDraft(initialTimeFieldPickerDraft(value, now))
    setOpen(true)
  }

  function applyDraft() {
    closeSheet(() => {
      setOpen(false)
      onChange(commitTimeFieldPickerDraft(pickerDraft))
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
        onBlur={() => {
          if (commitTypedClearOnBlur && inputDraft === '') onClear?.()
          setInputDraft(null)
        }}
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
          boundedBody
          open
          title={t('common.selectTime')}
          onClose={() => setOpen(false)}
          actions={<PillButton size="sm" onClick={applyDraft}>{t('common.done')}</PillButton>}
        >
          <div className="flex min-h-[var(--touch-min)] shrink gap-1" style={{ height: 220 }}>
            <TimeColumn
              values={resolvedHourCycle === 'h23' ? HOURS_24 : HOURS_12}
              selected={resolvedHourCycle === 'h23' ? pickerDraft.hour24 : hour12}
              formatValue={(option) => padTimePart(Number(option))}
              label={t('common.hours')}
              onSelect={(option) =>
                setPickerDraft((current) => selectTimeFieldHour(current, Number(option), resolvedHourCycle))
              }
            />
            <TimeColumn
              values={MINUTES}
              selected={pickerDraft.minute}
              formatValue={(option) => padTimePart(Number(option))}
              label={t('common.minutes')}
              onSelect={(option) => setPickerDraft((current) => selectTimeFieldMinute(current, Number(option)))}
            />
            {resolvedHourCycle === 'h23' ? null : (
              <TimeColumn
                values={DAY_PERIODS}
                selected={period}
                formatValue={String}
                label={t('common.amPm')}
                onSelect={(option) =>
                  setPickerDraft((current) => selectTimeFieldPeriod(current, option as DayPeriod))
                }
              />
            )}
          </div>
        </Sheet>
      ) : null}
    </div>
  )
}
