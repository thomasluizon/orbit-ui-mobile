'use client'

import type { ChangeEvent, InputHTMLAttributes, ReactNode } from 'react'

/** v8 UnderlinedInput: optional tiny label, bare input with hairline underline.
 *  Used across login, onboarding, modals, and create sheets per the v8 spec. */
interface UnderlinedInputProps {
  label?: ReactNode
  value?: string
  onChange?: (next: string) => void
  placeholder?: string
  type?: InputHTMLAttributes<HTMLInputElement>['type']
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode']
  autoComplete?: string
  mono?: boolean
  large?: boolean
  disabled?: boolean
  maxLength?: number
  ariaLabel?: string
  id?: string
  name?: string
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void
  autoFocus?: boolean
}

export function UnderlinedInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  inputMode,
  autoComplete,
  mono = false,
  large = false,
  disabled = false,
  maxLength,
  ariaLabel,
  id,
  name,
  onKeyDown,
  autoFocus = false,
}: Readonly<UnderlinedInputProps>) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange?.(event.target.value)
  }

  const fontSize = large ? 17 : 14
  const padY = large ? 8 : 4

  return (
    <label className="flex flex-col" style={{ gap: 6 }}>
      {label && (
        <span
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--fg-3)',
          }}
        >
          {label}
        </span>
      )}
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
        style={{
          appearance: 'none',
          border: 0,
          background: 'transparent',
          outline: 'none',
          fontFamily: mono ? 'var(--font-family-mono)' : 'var(--font-family-sans)',
          fontSize,
          color: 'var(--fg-1)',
          padding: `${padY}px 0`,
          borderBottom: '1px solid var(--hairline-strong)',
          fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
          width: '100%',
        }}
      />
    </label>
  )
}
