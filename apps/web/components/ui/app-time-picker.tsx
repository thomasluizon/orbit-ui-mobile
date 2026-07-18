'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Clock3, X } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { detectDefaultTimeFormat, formatLocaleTime } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'
import { CenteredOverlay } from '@/components/ui/centered-overlay'

interface AppTimePickerProps {
  id?: string
  value: string
  onChange: (value: string) => void
  /** Optional clear callback. When provided and value is set, an X button
   *  replaces the clock icon and tapping it invokes onClear. */
  onClear?: () => void
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
  className?: string
}

const HOURS_24 = Array.from({ length: 24 }, (_, index) => index)
const HOURS_12 = Array.from({ length: 12 }, (_, index) => index + 1)
const MINUTES = Array.from({ length: 60 }, (_, index) => index)
const PERIODS = ['AM', 'PM'] as const

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function parseTime(value: string): { hour24: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hour24 = Number(match[1])
  const minute = Number(match[2])
  if (hour24 > 23 || minute > 59) return null
  return { hour24, minute }
}

function to12Hour(hour24: number): { hour12: number; period: 'AM' | 'PM' } {
  return {
    hour12: ((hour24 + 11) % 12) + 1,
    period: hour24 < 12 ? 'AM' : 'PM',
  }
}

function from12Hour(hour12: number, period: 'AM' | 'PM'): number {
  const base = hour12 % 12
  return period === 'PM' ? base + 12 : base
}

interface TimeColumnProps {
  values: readonly (number | string)[]
  selected: number | string
  formatValue: (value: number | string) => string
  ariaLabel: string
  onSelect: (value: number | string) => void
}

function TimeColumn({ values, selected, formatValue, ariaLabel, onSelect }: Readonly<TimeColumnProps>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const option = selectedRef.current
    if (container && option) {
      container.scrollTop = option.offsetTop - container.clientHeight / 2 + option.clientHeight / 2
    }
  }, [])

  return (
    <div
      ref={containerRef}
      role="listbox"
      aria-label={ariaLabel}
      className="h-full flex-1 snap-y overflow-y-auto px-1 [scrollbar-width:thin]"
    >
      {values.map((value) => {
        const isSelected = value === selected
        return (
          <button
            key={String(value)}
            ref={isSelected ? selectedRef : undefined}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(value)}
            className={`w-full min-h-[44px] snap-center rounded-[10px] py-2 text-center text-base transition-colors ${
              isSelected
                ? 'bg-[var(--primary)] text-[var(--fg-on-primary)]'
                : 'text-[var(--fg-1)] hover:bg-[var(--bg-elev)]'
            }`}
            style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}
          >
            {formatValue(value)}
          </button>
        )
      })}
    </div>
  )
}

export function AppTimePicker({
  id,
  value,
  onChange,
  onClear,
  placeholder,
  ariaLabel,
  disabled = false,
  className = '',
}: Readonly<AppTimePickerProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const generatedId = useId()
  const dialogLabelId = useId()
  const inputId = id ?? generatedId
  const { profile } = useProfile()
  const is24Hour = profile?.uses24HourClock ?? detectDefaultTimeFormat(locale) === '24h'
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState({ hour24: 9, minute: 0 })

  const displayValue = value
    ? formatLocaleTime(value, locale, { hour: 'numeric', minute: '2-digit', hour12: !is24Hour })
    : ''
  const canClear = !disabled && !!value && !!onClear
  const { hour12, period } = to12Hour(draft.hour24)

  const closePicker = useCallback(() => setIsOpen(false), [])

  const openPicker = useCallback(() => {
    if (disabled) return
    const parsed = parseTime(value)
    const now = new Date()
    setDraft(parsed ?? { hour24: now.getHours(), minute: now.getMinutes() })
    setIsOpen(true)
  }, [disabled, value])

  function applyDraft() {
    onChange(`${pad(draft.hour24)}:${pad(draft.minute)}`)
    closePicker()
  }

  return (
    <div className={`relative ${className}`}>
      <button
        id={inputId}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={
          ariaLabel ??
          (displayValue ? t('common.selectedTime', { time: displayValue }) : t('common.selectTime'))
        }
        onClick={() => (isOpen ? closePicker() : openPicker())}
        className="flex w-full min-h-[54px] items-center justify-between rounded-[14px] bg-[var(--bg-field)] px-4 py-3 text-left text-base text-[var(--fg-1)] shadow-[inset_0_0_0_1px_var(--hairline)] transition-[background-color,box-shadow,color] duration-[var(--dur-fast)] focus:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--primary)] disabled:opacity-60"
        style={canClear ? { paddingRight: 40 } : undefined}
      >
        <span className={displayValue ? '' : 'text-[var(--fg-3)]'}>
          {displayValue || placeholder || t('common.selectTime')}
        </span>
        {!canClear && <Clock3 size={20} strokeWidth={1.8} className="text-[var(--fg-4)]" aria-hidden="true" />}
      </button>

      {canClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={t('common.clear')}
          className="absolute right-1 top-1/2 grid -translate-y-1/2 place-items-center rounded-full text-[var(--fg-3)] transition-colors hover:bg-[var(--bg-sunk)] hover:text-[var(--fg-1)]"
          style={{ width: 44, height: 44 }}
        >
          <X size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
      )}

      <CenteredOverlay
        open={isOpen}
        onDismiss={closePicker}
        ariaLabelledBy={dialogLabelId}
        panelClassName="w-[min(90vw,320px)] rounded-[16px] bg-[var(--bg-sheet)] p-2.5 text-[var(--fg-1)] shadow-[var(--shadow-2),inset_0_0_0_1px_var(--hairline)]"
      >
        <div className="mb-2 flex items-center justify-between px-1">
          <span id={dialogLabelId} className="text-xs font-medium text-[var(--fg-1)]">
            {t('common.selectTime')}
          </span>
          <button
            type="button"
            onClick={applyDraft}
            className="rounded-lg px-2 py-1 text-sm font-medium text-[var(--primary)] transition-colors hover:bg-[var(--bg-elev)]"
          >
            {t('common.done')}
          </button>
        </div>

        <div className="flex gap-1.5" style={{ height: 220 }}>
          <TimeColumn
            values={is24Hour ? HOURS_24 : HOURS_12}
            selected={is24Hour ? draft.hour24 : hour12}
            formatValue={(columnValue) => pad(Number(columnValue))}
            ariaLabel={t('common.hours')}
            onSelect={(columnValue) =>
              setDraft((current) => ({
                ...current,
                hour24: is24Hour
                  ? Number(columnValue)
                  : from12Hour(Number(columnValue), period),
              }))
            }
          />
          <TimeColumn
            values={MINUTES}
            selected={draft.minute}
            formatValue={(columnValue) => pad(Number(columnValue))}
            ariaLabel={t('common.minutes')}
            onSelect={(columnValue) =>
              setDraft((current) => ({ ...current, minute: Number(columnValue) }))
            }
          />
          {!is24Hour && (
            <TimeColumn
              values={PERIODS}
              selected={period}
              formatValue={String}
              ariaLabel={t('common.amPm')}
              onSelect={(columnValue) =>
                setDraft((current) => ({
                  ...current,
                  hour24: from12Hour(to12Hour(current.hour24).hour12, columnValue as 'AM' | 'PM'),
                }))
              }
            />
          )}
        </div>
      </CenteredOverlay>
    </div>
  )
}
