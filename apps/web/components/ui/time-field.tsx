'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  DAY_PERIODS,
  detectDefaultTimeFormat,
  formatLocaleTime,
  formatTimeParts,
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

interface TimeFieldProps {
  id?: string
  value: string
  onChange: (value: string) => void
  onClear?: () => void
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
  className?: string
}

interface TimeColumnProps {
  values: readonly (number | string)[]
  selected: number | string
  formatValue: (value: number | string) => string
  label: string
  onSelect: (value: number | string) => void
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

export function TimeField({
  id,
  value,
  onChange,
  onClear,
  placeholder,
  ariaLabel,
  disabled = false,
  className = '',
}: Readonly<TimeFieldProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const generatedId = useId()
  const { profile } = useProfile()
  const is24Hour = profile?.uses24HourClock ?? detectDefaultTimeFormat(locale) === '24h'
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ hour24: 9, minute: 0 })
  const { sheetRef, closeSheet } = useSheetHost()

  const displayValue = value
    ? formatLocaleTime(value, locale, { hour: 'numeric', minute: '2-digit', hour12: !is24Hour })
    : ''
  const canClear = !disabled && value.length > 0 && onClear != null
  const { hour12, period } = to12Hour(draft.hour24)

  function openPicker() {
    const now = new Date()
    setDraft(parseTimeParts(value) ?? { hour24: now.getHours(), minute: now.getMinutes() })
    setOpen(true)
  }

  function applyDraft() {
    closeSheet(() => {
      setOpen(false)
      onChange(formatTimeParts(draft))
    })
  }

  return (
    <div className={`relative ${className}`}>
      <button
        id={id ?? generatedId}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel ?? (displayValue || t('common.selectTime'))}
        onClick={openPicker}
        className="flex w-full min-h-[54px] items-center justify-between rounded-[14px] bg-[var(--bg-field)] px-4 py-3 text-left text-base text-[var(--fg-1)] shadow-[inset_0_0_0_1px_var(--hairline)] transition-[background-color,box-shadow,color] duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--primary)] disabled:opacity-60"
        style={canClear ? { paddingRight: 48 } : undefined}
      >
        <span className={displayValue ? '' : 'text-[var(--fg-3)]'}>
          {displayValue || placeholder || t('common.selectTime')}
        </span>
        {!canClear ? <Clock3 size={20} strokeWidth={1.8} aria-hidden="true" /> : null}
      </button>
      {canClear ? (
        <button
          type="button"
          onClick={onClear}
          aria-label={t('common.clear')}
          className="absolute right-1 top-1/2 grid -translate-y-1/2 place-items-center rounded-full text-[var(--fg-3)] hover:bg-[var(--bg-sunk)]"
          style={{ width: 44, height: 44 }}
        >
          <X size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
      ) : null}
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
              values={is24Hour ? HOURS_24 : HOURS_12}
              selected={is24Hour ? draft.hour24 : hour12}
              formatValue={(option) => padTimePart(Number(option))}
              label={t('common.hours')}
              onSelect={(option) =>
                setDraft((current) => ({
                  ...current,
                  hour24: is24Hour ? Number(option) : from12Hour(Number(option), period),
                }))
              }
            />
            <TimeColumn
              values={MINUTES}
              selected={draft.minute}
              formatValue={(option) => padTimePart(Number(option))}
              label={t('common.minutes')}
              onSelect={(option) => setDraft((current) => ({ ...current, minute: Number(option) }))}
            />
            {is24Hour ? null : (
              <TimeColumn
                values={DAY_PERIODS}
                selected={period}
                formatValue={String}
                label={t('common.amPm')}
                onSelect={(option) =>
                  setDraft((current) => ({
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
