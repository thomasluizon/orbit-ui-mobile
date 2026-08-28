'use client'

import type { Time24, TimeFieldProps } from '@orbit/shared/contracts/forms'
import { useId, type ChangeEvent } from 'react'

const TIME_24_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/

export function TimeField({
  label,
  value,
  onChange,
  onClear,
  hourCycle = 'h23',
  hint,
  disabled = false,
  error,
  step = 60,
}: Readonly<TimeFieldProps>) {
  const inputId = useId()
  const descriptionId = useId()

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value
    if (!nextValue) {
      onClear?.()
      return
    }
    if (TIME_24_PATTERN.test(nextValue)) onChange(nextValue as Time24)
  }

  return (
    <div className="flex w-full flex-col gap-2" data-error={error ? '' : undefined}>
      <label htmlFor={inputId} className="text-sm font-medium text-[var(--fg-2)]">{label}</label>
      <input
        id={inputId}
        type="time"
        value={value}
        onChange={handleChange}
        disabled={disabled}
        step={step}
        lang={hourCycle === 'h12' ? 'en-US' : 'en-GB'}
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
