'use client'

interface MonoToggleProps {
  on: boolean
  onToggle: () => void
  ariaLabel: string
  disabled?: boolean
  /** Text shown when on. Default "ON". */
  onLabel?: string
  /** Text shown when off. Default "OFF". */
  offLabel?: string
}

/** v8 MonoToggle: monospaced ON/OFF pill, hairline ring inactive, primary fill when on. */
export function MonoToggle({
  on,
  onToggle,
  ariaLabel,
  disabled = false,
  onLabel = 'ON',
  offLabel = 'OFF',
}: Readonly<MonoToggleProps>) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onToggle}
      className="appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 shrink-0 font-[family-name:var(--font-family-mono)]"
      style={{
        minWidth: 44,
        padding: '4px 8px',
        borderRadius: 4,
        border: `1px solid ${on ? 'var(--primary)' : 'var(--hairline-strong)'}`,
        background: on ? 'var(--primary)' : 'transparent',
        color: on ? 'var(--fg-on-primary)' : 'var(--fg-2)',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.06em',
        transition: 'background-color 150ms, border-color 150ms, color 150ms',
      }}
    >
      {on ? onLabel : offLabel}
    </button>
  )
}
