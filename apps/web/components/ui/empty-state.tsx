'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'

export interface EmptyStateAction {
  label: string
  onClick?: () => void
  href?: string
  disabled?: boolean
  leading?: ReactNode
  variant?: 'primary' | 'secondary'
  /** Locale-independent hook for the surface-capture tool to open the action's overlay. */
  testId?: string
}

interface EmptyStateProps {
  title?: string
  description?: string
  /**
   * Swaps the Satellite glyph for a tonal icon disc. The Satellite is the empty half of the state
   * triad (DESIGN.md); every other centred state (locked, gated, no-data, load error) names its own
   * icon and shares this one lockup instead of hand-rolling it.
   */
  icon?: LucideIcon
  action?: EmptyStateAction
  /** Rendered under the action, on the same centred rhythm: an inline error, a hint, or a second CTA. */
  footer?: ReactNode
  /**
   * When both `action` and `footer` render as a stacked CTA pair, size them to match the wider
   * of the two instead of each hugging its own content. `PillButton` is otherwise hug-only by
   * contract (DESIGN.md Buttons) — this is that rule's one sanctioned, scoped exception, for the
   * specific case of two pills stacked as a visual pair. Has no effect unless both `action` and
   * `footer` are present.
   */
  matchActionFooterWidth?: boolean
  className?: string
}

/**
 * The one centred state lockup: Satellite glyph or tonal icon disc, optional title, body copy at a
 * readable measure, an optional hugging CTA, and an optional footer slot. Every empty, locked,
 * gated, no-data and load-error surface on both platforms renders through this.
 */
export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  footer,
  matchActionFooterWidth,
  className,
}: Readonly<EmptyStateProps>) {
  const hasFooter = Boolean(footer)
  const matchWidth = matchActionFooterWidth && Boolean(action) && hasFooter

  return (
    <div
      data-empty-state={Icon ? 'icon' : 'satellite'}
      className={[
        'animate-scale-in flex flex-col items-center gap-5 px-6 py-12 text-center',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {Icon ? (
        <span
          aria-hidden="true"
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[var(--bg-field)]"
        >
          <Icon size={28} strokeWidth={1.4} className="text-[var(--fg-3)]" />
        </span>
      ) : (
        <SatelliteGlyph />
      )}

      <div className="flex min-w-0 flex-col items-center gap-2">
        {title ? (
          <p className="t-h2" style={{ maxWidth: '28ch', textWrap: 'balance' }}>
            {title}
          </p>
        ) : null}
        {description ? (
          <p className="t-secondary" style={{ maxWidth: '46ch', textWrap: 'pretty' }}>
            {description}
          </p>
        ) : null}
      </div>

      {action || hasFooter ? (
        <div
          className={
            matchWidth
              ? 'grid min-w-0 justify-center gap-3'
              : 'flex min-w-0 flex-col items-center gap-3'
          }
        >
          {action ? (
            <PillButton
              variant={action.variant === 'secondary' ? 'ghost' : 'primary'}
              onClick={action.onClick}
              href={action.href}
              disabled={action.disabled}
              leading={action.leading}
              dataTestId={action.testId}
            >
              {action.label}
            </PillButton>
          ) : null}
          {footer}
        </div>
      ) : null}
    </div>
  )
}
