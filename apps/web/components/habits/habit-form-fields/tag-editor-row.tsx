import { X } from '@/components/ui/icons'
import { MAX_TAG_NAME_LENGTH } from '@orbit/shared/validation'

interface TagEditorRowProps {
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
  placeholder,
  inputAriaLabel,
  actionLabel,
  cancelAriaLabel,
  disabled,
  onChange,
  onCommit,
  onCancel,
}: Readonly<TagEditorRowProps>) {
  return (
    <div className="flex items-center gap-2">
      <input
        value={value}
        type="text"
        aria-label={inputAriaLabel}
        placeholder={placeholder}
        maxLength={MAX_TAG_NAME_LENGTH}
        disabled={disabled}
        className="flex-1 min-w-0 bg-[var(--bg-field)] text-[var(--fg-1)] placeholder:text-[var(--fg-3)] rounded-[12px] py-2.5 px-3.5 text-[13px] shadow-[inset_0_0_0_1px_var(--hairline)] border-0 focus:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--primary)] transition-[box-shadow] duration-[var(--dur-fast)]"
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
        className="shrink-0 rounded-full bg-[var(--primary)] text-[var(--fg-on-primary)] hover:bg-[var(--primary-pressed)] transition-[background-color,opacity,transform] duration-[var(--dur-fast)] active:scale-[0.96] disabled:opacity-40"
        style={{
          padding: '9px 14px',
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
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
        className="touch-target shrink-0 grid size-10 place-items-center rounded-full text-[var(--fg-3)] hover:text-[var(--fg-1)] transition-colors duration-[var(--dur-fast)]"
        disabled={disabled}
        onClick={onCancel}
      >
        <X size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  )
}
