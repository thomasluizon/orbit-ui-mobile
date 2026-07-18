'use client'

import { WifiOff } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'

interface OfflineUnavailableStateProps {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  compact?: boolean
  disabled?: boolean
}

/**
 * Inline alert shown where a capability needs a connection: a leading wifi-off glyph, the reason,
 * and an optional hugging retry pill. `compact` steps the type and padding down for use inside a
 * row or sheet rather than as a standalone block.
 */
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
      className={[
        'flex min-w-0 gap-3 rounded-[18px] bg-[var(--bg-card)] shadow-[inset_0_0_0_1px_var(--hairline)]',
        compact ? 'p-3' : 'p-4',
      ].join(' ')}
      role="alert"
      aria-live="polite"
      aria-label={`${title}. ${description}`}
      data-offline-state={compact ? 'compact' : 'block'}
    >
      <WifiOff
        size={22}
        strokeWidth={1.8}
        className="mt-px shrink-0 text-[var(--fg-3)]"
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: compact ? 'var(--fs-sm)' : 'var(--fs-base)',
              fontWeight: 500,
              lineHeight: 'var(--lh-snug)',
              color: 'var(--fg-1)',
            }}
          >
            {title}
          </p>
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: compact ? 'var(--fs-xs)' : 'var(--fs-sm)',
              lineHeight: 'var(--lh-body)',
              color: 'var(--fg-3)',
              maxWidth: '46ch',
              textWrap: 'pretty',
            }}
          >
            {description}
          </p>
        </div>
        {actionLabel && onAction ? (
          <PillButton
            variant="ghost"
            size="sm"
            onClick={onAction}
            disabled={disabled}
            ariaLabel={actionLabel}
          >
            {actionLabel}
          </PillButton>
        ) : null}
      </div>
    </div>
  )
}
