'use client'

import type { OtpInputProps } from '@orbit/shared/contracts/forms'
import { useEffect, useId, useRef, type ChangeEvent } from 'react'

export function OtpInput({
  label,
  value,
  onChange,
  onComplete,
  error,
  hint,
  disabled = false,
  autoFocus = true,
  length = 6,
  id,
}: Readonly<OtpInputProps>) {
  const descriptionId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const digits = value.slice(0, length).split('')
  const activeIndex = Math.min(value.length, length - 1)

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value.replace(/\D/g, '').slice(0, length)
    onChange(nextValue)
    if (nextValue.length === length) onComplete?.(nextValue)
  }

  useEffect(() => {
    if (error) inputRef.current?.focus()
  }, [error])

  return (
    <div className="flex flex-col gap-2" data-error={error ? '' : undefined}>
      <div className="relative flex items-center justify-center gap-2">
        <input
          ref={inputRef}
          id={id}
          value={value}
          onChange={handleChange}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? descriptionId : undefined}
          disabled={disabled}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus={autoFocus}
          spellCheck={false}
          className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
        />
        {Array.from({ length }, (_, index) => (
          <span
            key={index}
            aria-hidden="true"
            data-otp-cell=""
            data-error={error ? '' : undefined}
            data-active={index === activeIndex ? '' : undefined}
            className="grid h-[58px] w-12 place-items-center rounded-[12px] bg-[var(--bg-field)] font-mono text-[26px] font-medium text-[var(--fg-1)]"
            style={{
              boxShadow: error
                ? 'inset 0 0 0 2px var(--status-bad)'
                : index === activeIndex
                  ? 'inset 0 0 0 2px var(--primary)'
                  : 'inset 0 0 0 1px var(--border-control)',
            }}
          >
            {digits[index] ?? ''}
          </span>
        ))}
      </div>
      {error || hint ? (
        <span
          id={descriptionId}
          role={error ? 'alert' : undefined}
          className={`text-xs ${error ? 'text-[var(--status-bad-text)]' : 'text-[var(--fg-3)]'}`}
        >
          {error ?? hint}
        </span>
      ) : null}
    </div>
  )
}
