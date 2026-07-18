'use client'

import {
  useId,
  type ChangeEvent,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import type { UseFormRegisterReturn } from 'react-hook-form'

const CONTROL_STYLE_BASE = {
  flex: 1,
  minWidth: 0,
  appearance: 'none',
  border: 0,
  background: 'transparent',
  fontSize: 16,
  color: 'var(--fg-1)',
} as const

const LABEL_STYLE = {
  fontFamily: 'var(--font-sans)',
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--fg-2)',
} as const

const ERROR_STYLE = {
  fontFamily: 'var(--font-sans)',
  fontSize: 12,
  color: 'var(--status-bad-text)',
} as const

/** Kit Field: optional Rubik 14/500 label above a 54px filled well (radius 14,
 *  inset hairline ring, primary ring on focus, status-bad ring + caption when
 *  `error` is set, dimmed well when disabled) with an optional trailing node.
 *  Single owner of the field-well recipe: every form control on web renders
 *  through this primitive. */
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
  min?: number
  step?: string | number
  ariaLabel?: string
  id?: string
  name?: string
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  autoFocus?: boolean
  leading?: ReactNode
  trailing?: ReactNode
  /** Validation message rendered below the well; also paints the status-bad ring. */
  error?: string
  /** Spread of react-hook-form's `register(...)`, supplying name, ref and change/blur handlers in place of `value`/`onChange`. */
  registration?: UseFormRegisterReturn
  /** Renders a textarea inside the same well instead of a single-line input. */
  multiline?: boolean
  rows?: number
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
  min,
  step,
  ariaLabel,
  id,
  name,
  onKeyDown,
  autoFocus = false,
  leading,
  trailing,
  error,
  registration,
  multiline = false,
  rows,
}: Readonly<FieldInputProps>) {
  const errorId = useId()

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    onChange?.(event.target.value)
  }

  const controlStyle: CSSProperties = {
    ...CONTROL_STYLE_BASE,
    fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
    fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
    ...(multiline ? { resize: 'none', padding: '15px 0' } : null),
  }

  const controlProps = {
    id,
    placeholder,
    disabled,
    maxLength,
    'aria-label': ariaLabel,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
    onKeyDown,
    autoFocus,
    className: 'placeholder:text-[var(--fg-3)]',
    style: controlStyle,
  }

  const bindingProps = registration ?? { name, value, onChange: handleChange }
  const Root = label ? 'label' : 'div'

  return (
    <Root className="flex w-full flex-col" style={{ gap: 8 }}>
      {label && <span style={LABEL_STYLE}>{label}</span>}
      <div
        data-invalid={error ? 'true' : undefined}
        className={`field-ring flex rounded-[14px] bg-[var(--bg-field)] ${multiline ? 'items-stretch' : 'items-center'} ${disabled ? 'opacity-60' : ''}`}
        style={{
          minHeight: 54,
          gap: 8,
          paddingLeft: leading ? 12 : 16,
          paddingRight: trailing ? 8 : 16,
        }}
      >
        {leading}
        {multiline ? (
          <textarea rows={rows} {...controlProps} {...bindingProps} />
        ) : (
          <input
            type={type}
            inputMode={inputMode}
            autoComplete={autoComplete}
            min={min}
            step={step}
            {...controlProps}
            {...bindingProps}
          />
        )}
        {trailing}
      </div>
      {error && (
        <span id={errorId} role="alert" style={ERROR_STYLE}>
          {error}
        </span>
      )}
    </Root>
  )
}
