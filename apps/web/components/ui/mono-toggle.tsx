'use client'

interface MonoToggleProps {
  on: boolean
  onToggle: () => void
  ariaLabel: string
  disabled?: boolean
}

export function MonoToggle({ on, onToggle, ariaLabel, disabled }: Readonly<MonoToggleProps>) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onToggle}
      className="appearance-none border-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 relative shrink-0"
      style={{
        width: 36,
        height: 20,
        borderRadius: 999,
        background: on ? 'var(--primary)' : 'var(--bg-elev)',
        boxShadow: on ? 'none' : 'inset 0 0 0 1px var(--hairline-strong)',
      }}
    >
      <span
        aria-hidden="true"
        className="absolute rounded-full"
        style={{
          top: 2,
          left: 2,
          width: 16,
          height: 16,
          background: 'var(--fg-on-primary)',
          transform: on ? 'translateX(16px)' : 'translateX(0)',
          transition: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
    </button>
  )
}
