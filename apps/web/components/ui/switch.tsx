'use client'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  description?: string
  className?: string
}

export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
  description,
  className,
}: SwitchProps) {
  const switchButton = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex shrink-0 w-11 h-6 rounded-full transition-all duration-200',
        checked ? 'bg-primary' : 'bg-surface-elevated border border-border',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      <span
        className={[
          'size-5 rounded-full bg-white shadow-sm transition-all duration-200',
          'absolute top-0.5',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  )

  if (!label) {
    return <div className={className}>{switchButton}</div>
  }

  return (
    <div className={`flex items-center justify-between gap-4 ${className ?? ''}`}>
      <div className="flex flex-col">
        <span className="text-sm font-medium text-text-primary">{label}</span>
        {description && (
          <span className="text-xs text-text-muted mt-0.5">{description}</span>
        )}
      </div>
      {switchButton}
    </div>
  )
}
