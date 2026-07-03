'use client'

import { useTranslations } from 'next-intl'

interface MonoToggleProps {
  on: boolean
  onToggle: () => void
  ariaLabel: string
  disabled?: boolean
  /** Text shown when on. Defaults to t('common.toggleOn'). */
  onLabel?: string
  /** Text shown when off. Defaults to t('common.toggleOff'). */
  offLabel?: string
}

/** Kit toggle pill: bg-field fill, primary 0.12 tint + primary text when on, fg-3 text when off. */
export function MonoToggle({
  on,
  onToggle,
  ariaLabel,
  disabled = false,
  onLabel,
  offLabel,
}: Readonly<MonoToggleProps>) {
  const t = useTranslations('common')
  const resolvedOnLabel = onLabel ?? t('toggleOn')
  const resolvedOffLabel = offLabel ?? t('toggleOff')

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onToggle}
      className="touch-target-y appearance-none border-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 shrink-0 active:scale-[0.96]"
      style={{
        minWidth: 44,
        padding: '4px 12px',
        borderRadius: 999,
        background: on ? 'rgba(var(--primary-rgb), 0.12)' : 'var(--bg-field)',
        color: on ? 'var(--primary)' : 'var(--fg-3)',
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
        fontWeight: 500,
        transition:
          'background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-standard)',
      }}
    >
      {on ? resolvedOnLabel : resolvedOffLabel}
    </button>
  )
}
