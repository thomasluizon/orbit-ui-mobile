import { useEffect, useRef, useId } from 'react'
import { X } from '@/components/ui/icons'
import { MAX_TAG_NAME_LENGTH } from '@orbit/shared/validation'

interface TagEditorRowProps {
  error?: string
  focusRequest?: number
  value: string
  placeholder?: string
  inputAriaLabel: string
  actionLabel: string
  cancelAriaLabel: string
  disabled: boolean
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
}

export function TagEditorRow({
  value,
  error,
  focusRequest,
  placeholder,
  inputAriaLabel,
  actionLabel,
  cancelAriaLabel,
  disabled,
  onChange,
  onCommit,
  onCancel,
}: Readonly<TagEditorRowProps>) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (focusRequest) inputRef.current?.focus() }, [focusRequest])
  const errorId = useId()
  return (
    <div className="flex min-w-0 flex-col gap-2">
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        value={value}
        type="text"
        aria-label={inputAriaLabel}
        placeholder={placeholder}
        maxLength={MAX_TAG_NAME_LENGTH}
        disabled={disabled}
        className="flex-1 min-w-0 bg-[var(--bg-field)] text-[var(--fg-1)] placeholder:text-[var(--fg-3)] rounded-[12px] py-2 px-3 text-base sm:text-sm shadow-[inset_0_0_0_1px_var(--hairline)] border-0 focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--primary)] transition-[box-shadow] duration-[var(--dur-fast)]"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onCommit()
          }
        }}
      />
      <button
        type="button"
        className="habit-control-motion shrink-0 min-h-[var(--touch-min)] min-w-[var(--touch-min)] rounded-full bg-[var(--primary)] text-[var(--fg-on-primary)] hover:bg-[var(--primary-hover)] active:bg-[var(--primary-pressed)] active:scale-[0.96] disabled:opacity-40"
        style={{
          padding: '8px 12px',
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          fontWeight: 500,
        }}
        disabled={disabled}
        onClick={onCommit}
      >
        {actionLabel}
      </button>
      <button
        type="button"
        aria-label={cancelAriaLabel}
        className="habit-control-motion touch-target shrink-0 grid size-[var(--touch-min)] place-items-center rounded-full text-[var(--fg-3)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] hover:text-[var(--fg-1)] active:scale-[0.96]"
        disabled={disabled}
        onClick={onCancel}
      >
        <X size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
    {error ? <p id={errorId} role="alert" className="text-sm text-[var(--status-bad-text)]">{error}</p> : null}
    </div>
  )
}
