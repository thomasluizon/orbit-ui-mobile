'use client'

import { useId } from 'react'

interface SupportFieldProps {
  label?: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
  ariaLabel?: string
  type?: 'text' | 'email'
  mono?: boolean
  error?: string | null
  multiline?: boolean
  rows?: number
}

export function SupportField({
  label,
  value,
  onChange,
  placeholder,
  ariaLabel,
  type = 'text',
  mono = false,
  error,
  multiline = false,
  rows = 4,
}: Readonly<SupportFieldProps>) {
  const Tag = multiline ? 'textarea' : 'input'
  const fieldId = useId()
  return (
    <label htmlFor={fieldId} className="flex min-w-0 flex-1 flex-col" style={{ gap: 8 }}>
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
      <Tag
        id={fieldId}
        type={multiline ? undefined : type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? label}
        rows={multiline ? rows : undefined}
        className="w-full resize-none appearance-none rounded-[14px] border-0 bg-[var(--bg-field)] outline-none placeholder:text-[var(--fg-3)] focus:shadow-[inset_0_0_0_2px_var(--primary)]"
        style={{
          minHeight: multiline ? undefined : 54,
          padding: multiline ? '14px 16px' : '0 16px',
          boxShadow: error
            ? 'inset 0 0 0 1px var(--status-bad)'
            : 'inset 0 0 0 1px var(--hairline)',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
          fontSize: 16,
          lineHeight: 1.5,
          color: 'var(--fg-1)',
          fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
        }}
      />
      {error && (
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            color: 'var(--status-bad)',
          }}
        >
          {error}
        </span>
      )}
    </label>
  )
}
