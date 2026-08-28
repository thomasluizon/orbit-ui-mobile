'use client'

import type { OtpInputProps } from '@orbit/shared/contracts/forms'
import { useEffect, useId, useRef, type ChangeEvent } from 'react'

const CELL_COUNT = 6

export function OtpInput({ label, value, onChange, error }: Readonly<OtpInputProps>) {
  const errorId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const digits = value.slice(0, CELL_COUNT).split('')
  const activeIndex = Math.min(value.length, CELL_COUNT - 1)

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value.replace(/\D/g, '').slice(0, CELL_COUNT))
  }

  useEffect(() => {
    if (error) inputRef.current?.focus()
  }, [error])

  return (
    <div className="flex flex-col gap-2" data-error={error ? '' : undefined}>
      <div className="relative flex items-center justify-center gap-2">
        <input
          ref={inputRef}
          value={value}
          onChange={handleChange}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          spellCheck={false}
          className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
        />
        {Array.from({ length: CELL_COUNT }, (_, index) => (
          <span
            key={index}
            aria-hidden="true"
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
      {error ? (
        <span id={errorId} role="alert" className="text-xs text-[var(--status-bad-text)]">
          {error}
        </span>
      ) : null}
    </div>
  )
}
