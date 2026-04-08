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
      className={`flex gap-3 rounded-[var(--radius-lg)] border border-border bg-surface ${
        compact ? 'px-3 py-2.5' : 'p-4'
      }`}
      role="alert"
      aria-live="polite"
      aria-label={`${title}. ${description}`}
    >
      <div
        className={`mt-px flex shrink-0 items-center justify-center rounded-full bg-surface-elevated text-text-muted ${
          compact ? 'size-5' : 'size-7'
        }`}
        aria-hidden="true"
      >
        <WifiOff className={compact ? 'size-3.5' : 'size-4'} />
      </div>
      <div className="flex-1 space-y-2">
        <div className="space-y-1">
          <p className={`font-bold text-text-primary ${compact ? 'text-xs' : 'text-sm'}`}>{title}</p>
          <p className={`text-text-secondary ${compact ? 'text-[11px] leading-4' : 'text-xs leading-5'}`}>
            {description}
          </p>
        </div>
        {actionLabel && onAction ? (
          <button
            type="button"
            className="inline-flex items-center rounded-[var(--radius-md)] border border-border bg-surface-elevated px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-hover disabled:opacity-50"
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
