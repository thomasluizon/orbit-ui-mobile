'use client'

import { WifiOff } from 'lucide-react'

interface OfflineUnavailableStateProps {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  compact?: boolean
  disabled?: boolean
}

export function OfflineUnavailableState({
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
  disabled = false,
}: Readonly<OfflineUnavailableStateProps>) {
  return (
    <div
      className={`flex gap-3.5 rounded-[18px] bg-[var(--bg-card)] ${
        compact ? 'px-3.5 py-3' : 'p-4'
      }`}
      style={{ boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
      role="alert"
      aria-live="polite"
      aria-label={`${title}. ${description}`}
    >
      <WifiOff
        size={22}
        strokeWidth={1.8}
        className="mt-px shrink-0 text-[var(--fg-3)]"
        aria-hidden="true"
      />
      <div className="flex-1">
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: compact ? 14 : 16,
            fontWeight: 500,
            color: 'var(--fg-1)',
          }}
        >
          {title}
        </p>
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: compact ? 12.5 : 13.5,
            color: 'var(--fg-3)',
            lineHeight: 1.4,
            marginTop: 3,
          }}
        >
          {description}
        </p>
        {actionLabel && onAction ? (
          <button
            type="button"
            className="mt-3 inline-flex cursor-pointer items-center rounded-full border-0 bg-transparent text-[13px] font-medium text-[var(--fg-1)] enabled:hover:opacity-85 enabled:active:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              fontFamily: 'var(--font-sans)',
              padding: '8px 16px',
              boxShadow: 'inset 0 0 0 1.5px var(--hairline-strong)',
            }}
            onClick={onAction}
            disabled={disabled}
            aria-label={actionLabel}
            aria-disabled={disabled}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}
