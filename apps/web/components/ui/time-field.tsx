'use client'

import type { Time24, TimeFieldProps } from '@orbit/shared/contracts/forms'
import { useId, useState, type ChangeEvent } from 'react'
import { useLocale } from 'next-intl'
import { detectDefaultTimeFormat } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'

const TIME_24_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const TIME_12_PATTERN = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*([ap]m)$/i

function presentTime(value: Time24 | '', hourCycle: 'h23' | 'h12'): string {
  if (!value || hourCycle === 'h23') return value
  const [hourText, minute] = value.split(':')
  const hour = Number(hourText)
  return `${hour % 12 || 12}:${minute} ${hour < 12 ? 'am' : 'pm'}`
}

function parseTime(value: string, hourCycle: 'h23' | 'h12'): Time24 | null {
  if (hourCycle === 'h23') return TIME_24_PATTERN.test(value) ? value as Time24 : null
  const match = TIME_12_PATTERN.exec(value.trim())
  if (!match) return null
  const hour12 = Number(match[1])
  const hour24 = (hour12 % 12) + (match[3]!.toLowerCase() === 'pm' ? 12 : 0)
  return `${String(hour24).padStart(2, '0')}:${match[2]}` as Time24
}

export function TimeField({
  label,
  value,
  onChange,
  onClear,
  hourCycle,
  hint,
  disabled = false,
  error,
  step = 60,
}: Readonly<TimeFieldProps>) {
  const inputId = useId()
  const descriptionId = useId()
  const locale = useLocale()
  const { profile } = useProfile()
  const uses24HourClock = profile?.uses24HourClock
    ?? detectDefaultTimeFormat(locale) === '24h'
  const resolvedHourCycle = hourCycle ?? (uses24HourClock ? 'h23' : 'h12')
  const presentedValue = presentTime(value, resolvedHourCycle)
  const [draft, setDraft] = useState<string | null>(null)

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value
    setDraft(nextValue)
    if (!nextValue) {
      onClear?.()
      return
    }
    const parsed = parseTime(nextValue, resolvedHourCycle)
    if (parsed) onChange(parsed)
  }

  return (
    <div className="flex w-full flex-col gap-2" data-error={error ? '' : undefined}>
      <label htmlFor={inputId} className="text-sm font-medium text-[var(--fg-2)]">{label}</label>
      <input
        id={inputId}
        type="text"
        value={draft ?? presentedValue}
        onChange={handleChange}
        onFocus={() => setDraft(presentedValue)}
        onBlur={() => setDraft(null)}
        disabled={disabled}
        inputMode={resolvedHourCycle === 'h23' ? 'numeric' : 'text'}
        data-step={step}
        data-hour-cycle={resolvedHourCycle}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? descriptionId : undefined}
        className={`min-h-[54px] w-full rounded-[12px] border-0 bg-[var(--bg-field)] px-4 text-base text-[var(--fg-1)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${error
          ? 'shadow-[inset_0_0_0_2px_var(--status-bad)]'
          : 'shadow-[inset_0_0_0_1px_var(--border-control)] focus:shadow-[inset_0_0_0_2px_var(--primary)]'} disabled:opacity-60`}
      />
      {error || hint ? (
        <span id={descriptionId} role={error ? 'alert' : undefined} className={`text-xs ${error ? 'text-[var(--status-bad-text)]' : 'text-[var(--fg-3)]'}`}>
          {error ?? hint}
        </span>
      ) : null}
    </div>
  )
}
