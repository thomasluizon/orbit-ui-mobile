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
      className={`flex gap-3 rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--bg-elev)] ${
        compact ? 'px-3 py-2.5' : 'p-4'
      }`}
      role="alert"
      aria-live="polite"
      aria-label={`${title}. ${description}`}
    >
      <div
        className={`mt-px flex shrink-0 items-center justify-center rounded-full bg-[var(--bg-elev)] text-[var(--fg-3)] ${
          compact ? 'size-5' : 'size-7'
        }`}
        aria-hidden="true"
      >
        <WifiOff className={compact ? 'size-3.5' : 'size-4'} />
      </div>
      <div className="flex-1 space-y-2">
        <div className="space-y-1">
          <p className={`font-bold text-[var(--fg-1)] ${compact ? 'text-xs' : 'text-sm'}`}>{title}</p>
          <p className={`text-[var(--fg-2)] ${compact ? 'text-[11px] leading-4' : 'text-xs leading-5'}`}>
            {description}
          </p>
        </div>
        {actionLabel && onAction ? (
          <button
            type="button"
            className="inline-flex items-center rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--bg-elev)] px-3 py-1.5 text-xs font-semibold text-[var(--fg-1)] transition-colors hover:bg-[var(--bg-elev)] disabled:opacity-50"
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
