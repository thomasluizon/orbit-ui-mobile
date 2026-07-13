'use client'

import { useId, type ChangeEvent, type InputHTMLAttributes, type ReactNode } from 'react'

const INPUT_STYLE_BASE = {
  flex: 1,
  minWidth: 0,
  appearance: 'none',
  border: 0,
  background: 'transparent',
  // react-doctor-disable-next-line no-outline-none -- the field well renders the focus ring via `focus-within:shadow-[inset_0_0_0_2px_var(--primary)]` (wellRingClass), so keyboard focus stays clearly visible without the input's own outline https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  outline: 'none',
  fontSize: 16,
  color: 'var(--fg-1)',
} as const

/** Kit Field: optional Rubik 14/500 label above a 54px filled well (radius 14,
 *  inset hairline ring, primary ring on focus, status-bad ring + caption when
 *  `error` is set, dimmed well when disabled) with an optional trailing node. */
interface FieldInputProps {
  label?: ReactNode
  value?: string
  onChange?: (next: string) => void
  placeholder?: string
  type?: Exclude<InputHTMLAttributes<HTMLInputElement>['type'], undefined>
  inputMode?: Exclude<InputHTMLAttributes<HTMLInputElement>['inputMode'], undefined>
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
  /** Validation message rendered below the well; also paints the status-bad ring. */
  error?: string
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
  error,
}: Readonly<FieldInputProps>) {
  const errorId = useId()

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange?.(event.target.value)
  }

  const wellRingClass = error
    ? 'shadow-[inset_0_0_0_2px_var(--status-bad)]'
    : 'shadow-[inset_0_0_0_1px_var(--hairline)] focus-within:shadow-[inset_0_0_0_2px_var(--primary)]'

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
        className={`flex items-center rounded-[14px] bg-[var(--bg-field)] ${wellRingClass} ${disabled ? 'opacity-60' : ''}`}
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
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
          className="placeholder:text-[var(--fg-3)]"
          style={{
            ...INPUT_STYLE_BASE,
            fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
            fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
          }}
        />
        {trailing}
      </div>
      {error && (
        <span
          id={errorId}
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            color: 'var(--status-bad-text)',
          }}
        >
          {error}
        </span>
      )}
    </label>
  )
}
