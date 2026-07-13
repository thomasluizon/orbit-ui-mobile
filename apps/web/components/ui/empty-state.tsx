'use client'

import { PillButton } from '@/components/ui/pill-button'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'

interface EmptyStateAction {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary'
}

interface EmptyStateProps {
  title?: string
  description: string
  action?: EmptyStateAction
  className?: string
}

/** Kit empty state: satellite glyph, optional title, body copy, and optional pill CTA. */
export function EmptyState({
  title,
  description,
  action,
  className,
}: Readonly<EmptyStateProps>) {
  const renderAction = () => {
    if (!action) return null
    if (action.variant === 'secondary') {
      return (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-2 inline-flex cursor-pointer items-center border-0 bg-transparent px-4 py-[14px] text-[13px] font-medium text-[var(--primary)] hover:text-[var(--primary-pressed)] active:opacity-70"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          {action.label}
        </button>
      )
    }
    return (
      <PillButton onClick={action.onClick} className="mt-[22px]">
        {action.label}
      </PillButton>
    )
  }

  return (
    <div
      className={[
        'flex flex-col items-center py-12 px-6 text-center animate-scale-in',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <SatelliteGlyph />

      {title ? (
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 20,
            fontWeight: 500,
            color: 'var(--fg-1)',
            marginTop: 18,
          }}
        >
          {title}
        </p>
      ) : null}

      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          color: 'var(--fg-3)',
          lineHeight: 1.5,
          maxWidth: 280,
          marginTop: title ? 6 : 14,
        }}
      >
        {description}
      </p>

      {renderAction()}
    </div>
  )
}
