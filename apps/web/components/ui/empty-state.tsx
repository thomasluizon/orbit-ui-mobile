'use client'

import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  iconVariant?: 'default' | 'success'
  title?: string
  description: string
  action?: {
    label: string
    onClick: () => void
    variant?: 'primary' | 'secondary'
  }
  className?: string
}

const iconVariantClasses: Record<NonNullable<EmptyStateProps['iconVariant']>, string> = {
  default: 'bg-[var(--bg-sunk)] border border-[var(--hairline)] text-[var(--fg-3)]',
  success: 'bg-[var(--status-done)]/10 border border-[var(--status-done)]/20 text-[var(--status-done)]',
}

export function EmptyState({
  icon: Icon,
  iconVariant = 'default',
  title,
  description,
  action,
  className,
}: Readonly<EmptyStateProps>) {
  return (
    <div
      className={[
        'flex flex-col items-center py-12 px-6 text-center animate-scale-in',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className={`size-20 rounded-full flex items-center justify-center ${iconVariantClasses[iconVariant]}`}
        aria-hidden="true"
      >
        <Icon className="size-8" />
      </div>

      {title ? <p className="text-sm font-bold text-[var(--fg-1)] mt-4">{title}</p> : null}

      <p className="text-xs text-[var(--fg-3)] mt-1.5 max-w-[240px] mx-auto leading-relaxed">
        {description}
      </p>

      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className={[
            'mt-5 inline-flex items-center rounded-[var(--radius-md)] px-4 py-2 text-xs font-semibold transition-colors',
            action.variant === 'secondary'
              ? 'text-[var(--primary)] hover:text-[var(--primary-pressed)]'
              : 'bg-[var(--primary)] text-white hover:bg-[var(--primary-pressed)]',
          ].join(' ')}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  )
}
