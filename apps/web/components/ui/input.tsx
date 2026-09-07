'use client'

import type { InputProps } from '@orbit/shared/contracts/forms'
import { useEffect, useId, useRef, type ChangeEvent } from 'react'

const CONTROL_STYLE = {
  width: '100%',
  appearance: 'none',
  border: 0,
  background: 'transparent',
  outline: 'none',
  fontFamily: 'var(--font-sans)',
  fontSize: 16,
  lineHeight: '24px',
  color: 'var(--fg-1)',
  padding: '15px 16px',
} as const

export function Input({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  error,
  maxLength,
  kind = 'text',
  inputMode,
  autoComplete,
  mono = false,
  autoFocus = false,
  focusRequest = 0,
  name,
  onSubmit,
  trailing,
  ...shape
}: Readonly<InputProps>) {
  const controlId = useId()
  const errorId = useId()
  const multiline = shape.multiline === true
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (focusRequest) inputRef.current?.focus()
  }, [focusRequest])

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    onChange(event.target.value)
  }

  const controlProps = {
    id: controlId,
    ref: (control: HTMLInputElement | HTMLTextAreaElement | null) => { inputRef.current = control },
    name,
    value,
    placeholder,
    disabled,
    maxLength,
    inputMode,
    autoComplete,
    spellCheck: kind === 'email' ? false : undefined,
    autoFocus,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
    onChange: handleChange,
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !multiline) onSubmit?.()
    },
    className: 'block resize-none placeholder:text-[var(--fg-3)]',
  } as const

  return (
    <div className="flex w-full flex-col gap-2" data-multiline={multiline ? '' : undefined} data-error={error ? '' : undefined}>
      <label htmlFor={controlId} className="text-sm font-medium text-[var(--fg-2)]">
        {label}
      </label>
      <div
        className={`overflow-hidden rounded-[12px] bg-[var(--bg-field)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--primary)] forced-colors:border forced-colors:border-[CanvasText] forced-colors:focus-within:outline-[Highlight] ${error
          ? 'shadow-[inset_0_0_0_2px_var(--status-bad)]'
          : 'shadow-[inset_0_0_0_1px_var(--border-control)]'} ${disabled ? 'opacity-60' : ''}`}
        style={{ minHeight: 54 }}
      >
        {multiline ? (
          <textarea {...controlProps} rows={shape.rows} style={{ ...CONTROL_STYLE, minHeight: 54, fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)' }} />
        ) : (
          <div className="flex items-center">
            <input {...controlProps} type={kind} style={{ ...CONTROL_STYLE, minHeight: 54, fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)' }} />
            {trailing ? <span className="shrink-0 pr-4">{trailing}</span> : null}
          </div>
        )}
      </div>
      {error ? (
        <span id={errorId} role="alert" className="text-xs text-[var(--status-bad-text)]">
          {error}
        </span>
      ) : null}
    </div>
  )
}
