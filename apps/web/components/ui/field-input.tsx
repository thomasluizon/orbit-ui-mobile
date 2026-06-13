'use client'

import type { ChangeEvent, InputHTMLAttributes, ReactNode } from 'react'

/** Kit Field: optional Rubik 14/500 label above a 54px filled well (radius 14,
 *  inset hairline ring, primary ring on focus) with an optional trailing node. */
interface FieldInputProps {
  label?: ReactNode
  value?: string
  onChange?: (next: string) => void
  placeholder?: string
  type?: InputHTMLAttributes<HTMLInputElement>['type']
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode']
  autoComplete?: string
  mono?: boolean
  disabled?: boolean
  maxLength?: number
  ariaLabel?: string
  id?: string
  name?: string
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void
  autoFocus?: boolean
  trailing?: ReactNode
}

export function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  inputMode,
  autoComplete,
  mono = false,
  disabled = false,
  maxLength,
  ariaLabel,
  id,
  name,
  onKeyDown,
  autoFocus = false,
  trailing,
}: Readonly<FieldInputProps>) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange?.(event.target.value)
  }

  return (
    <label className="flex w-full flex-col" style={{ gap: 8 }}>
      {label && (
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--fg-2)',
          }}
        >
          {label}
        </span>
      )}
      <div
        className="flex items-center rounded-[14px] bg-[var(--bg-field)] shadow-[inset_0_0_0_1px_var(--hairline)] focus-within:shadow-[inset_0_0_0_2px_var(--primary)]"
        style={{ minHeight: 54, gap: 10, padding: '0 16px' }}
      >
        <input
          id={id}
          name={name}
          type={type}
          inputMode={inputMode}
          autoComplete={autoComplete}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
          aria-label={ariaLabel}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
          className="placeholder:text-[var(--fg-3)]"
          style={{
            flex: 1,
            minWidth: 0,
            appearance: 'none',
            border: 0,
            background: 'transparent',
            outline: 'none',
            fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
            fontSize: 16,
            color: 'var(--fg-1)',
            fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
          }}
        />
        {trailing}
      </div>
    </label>
  )
}
