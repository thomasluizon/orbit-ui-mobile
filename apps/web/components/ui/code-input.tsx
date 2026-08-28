'use client'

import { useState } from 'react'
import type { OtpInputProps } from '@orbit/shared/contracts/forms'
import { normalizeStepUpCode } from '@orbit/shared/utils'

export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  error,
  hint,
  disabled = false,
  autoFocus = false,
  label,
  id,
}: Readonly<OtpInputProps>) {
  const [focused, setFocused] = useState(false)
  const normalizedValue = normalizeStepUpCode(value, length)
  const activeIndex = Math.min(normalizedValue.length, length - 1)

  function handleChange(nextValue: string) {
    const normalized = normalizeStepUpCode(nextValue, length)
    onChange(normalized)
    if (normalized.length === length) onComplete?.(normalized)
  }

  return (
    <div className="flex flex-col" style={{ gap: 8 }} data-error={error ? '' : undefined}>
      <div className="relative w-fit max-w-full">
        <div className="flex" style={{ gap: 8 }} aria-hidden="true">
          {Array.from({ length }, (_, index) => {
            const digit = normalizedValue[index] ?? ''
            const active = focused && !disabled && index === activeIndex
            return (
              <span
                key={`otp-cell-${index}`}
                data-otp-cell={index}
                data-active={active || undefined}
                data-filled={digit ? '' : undefined}
                data-error={error ? '' : undefined}
                className="relative flex shrink-0 items-center justify-center"
                style={{
                  width: 44,
                  height: 56,
                  borderRadius: 12,
                  background: 'var(--bg-field)',
                  boxShadow: error
                    ? 'inset 0 0 0 2px var(--status-bad)'
                    : active
                      ? 'inset 0 0 0 2px var(--primary)'
                      : 'inset 0 0 0 1px var(--border-control)',
                  color: 'var(--fg-1)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 26,
                  fontWeight: 500,
                  fontVariantNumeric: 'tabular-nums',
                  opacity: disabled ? 0.4 : 1,
                }}
              >
                {digit}
                {active && !digit ? (
                  <span
                    aria-hidden="true"
                    className="animate-pulse"
                    style={{ width: 1, height: 28, background: 'var(--primary)' }}
                  />
                ) : null}
              </span>
            )
          })}
        </div>
        <input
          id={id}
          value={normalizedValue}
          onChange={(event) => handleChange(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id ?? 'otp'}-error` : hint ? `${id ?? 'otp'}-hint` : undefined}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          spellCheck={false}
          className="absolute inset-0 cursor-text border-0 bg-transparent text-transparent outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed"
          style={{ width: '100%', height: '100%', caretColor: 'transparent' }}
        />
      </div>
      {error ? (
        <p
          id={`${id ?? 'otp'}-error`}
          role="alert"
          style={{ color: 'var(--status-bad-text)', fontSize: 14, lineHeight: 1.5 }}
        >
          {error}
        </p>
      ) : hint ? (
        <p
          id={`${id ?? 'otp'}-hint`}
          style={{
            color: 'var(--fg-3)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          {hint}
        </p>
      ) : null}
    </div>
  )
}
