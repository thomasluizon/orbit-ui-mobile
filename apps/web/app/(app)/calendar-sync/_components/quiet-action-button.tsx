'use client'

interface QuietActionButtonProps {
  onClick: () => void
  disabled?: boolean
  tone?: 'default' | 'warning'
  ariaLabel?: string
  children: React.ReactNode
}

export function QuietActionButton({
  onClick,
  disabled = false,
  tone = 'default',
  ariaLabel,
  children,
}: Readonly<QuietActionButtonProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="chip disabled:opacity-50 disabled:cursor-not-allowed"
      style={tone === 'warning' ? { color: 'var(--status-overdue-text)' } : undefined}
    >
      {children}
    </button>
  )
}
