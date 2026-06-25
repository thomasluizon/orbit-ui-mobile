'use client'

interface FieldWellProps {
  label: string
  id: string
  type: 'text' | 'number'
  mono?: boolean
  value: string
  placeholder?: string
  maxLength?: number
  readOnly?: boolean
  error?: string
  onChange: (next: string) => void
}

/** Kit field well with native min/step semantics and inline error slot. */
export function FieldWell({
  label,
  id,
  type,
  mono = false,
  value,
  placeholder,
  maxLength,
  readOnly = false,
  error,
  onChange,
}: Readonly<FieldWellProps>) {
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <label
        htmlFor={id}
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          fontWeight: 500,
          color: 'var(--fg-2)',
        }}
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        readOnly={readOnly}
        step={type === 'number' ? 'any' : undefined}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-[14px] border-0 bg-[var(--bg-field)] shadow-[inset_0_0_0_1px_var(--hairline)] outline-none placeholder:text-[var(--fg-3)] focus:shadow-[inset_0_0_0_2px_var(--primary)]"
        style={{
          minHeight: 54,
          padding: '0 16px',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
          fontSize: 16,
          color: readOnly ? 'var(--fg-3)' : 'var(--fg-1)',
          fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
          opacity: readOnly ? 0.6 : 1,
        }}
      />
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            color: 'var(--status-overdue-text)',
          }}
        >
          {error}
        </p>
      )}
    </div>
  )
}
