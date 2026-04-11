'use client'

interface PillToggleOption<T extends string> {
  value: T
  label: string
}

interface PillToggleProps<T extends string> {
  options: PillToggleOption<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  className?: string
}

export function PillToggle<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
}: Readonly<PillToggleProps<T>>) {
  const sizeClasses = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'

  return (
    <div className={`flex flex-wrap gap-2 ${className ?? ''}`}>
      {options.map((option) => {
        const isActive = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={[
              'rounded-[var(--radius-full)] font-semibold transition-all duration-200',
              sizeClasses,
              isActive
                ? 'bg-primary text-white shadow-[var(--shadow-glow-sm)]'
                : 'bg-background border border-border text-text-secondary hover:text-text-primary hover:border-border-emphasis',
            ].join(' ')}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
