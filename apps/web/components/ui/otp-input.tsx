'use client'

import type { OtpInputProps } from '@orbit/shared/contracts/forms'
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'

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
  name = 'verificationCode',
}: Readonly<OtpInputProps>) {
  const descriptionId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
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
      <div className="orbit-otp-hover relative flex items-center justify-center gap-2">
        <input
          ref={inputRef}
          id={id}
          name={name}
          value={value}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
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
            data-active={focused && !disabled && index === activeIndex ? '' : undefined}
            className={`pointer-events-none grid h-[56px] w-[44px] shrink-0 place-items-center rounded-[12px] bg-[var(--bg-field)] font-mono text-[26px] font-medium text-[var(--fg-1)] ${focused && !disabled && index === activeIndex ? 'shadow-[inset_0_0_0_2px_var(--primary)]' : error ? 'shadow-[inset_0_0_0_2px_var(--status-bad)]' : 'shadow-[inset_0_0_0_1px_var(--border-control)]'} forced-colors:border-2 forced-colors:border-[CanvasText] forced-colors:data-[active]:border-[Highlight]`}
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
