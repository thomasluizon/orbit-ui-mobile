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
  default: 'bg-surface-ground border border-border-muted text-text-muted',
  success: 'bg-green-500/10 border border-green-500/20 text-green-400',
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

      {title ? <p className="text-sm font-bold text-text-primary mt-4">{title}</p> : null}

      <p className="text-xs text-text-muted mt-1.5 max-w-[240px] mx-auto leading-relaxed">
        {description}
      </p>

      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className={[
            'mt-5 inline-flex items-center rounded-[var(--radius-md)] px-4 py-2 text-xs font-semibold transition-colors',
            action.variant === 'secondary'
              ? 'text-primary hover:text-primary/80'
              : 'bg-primary text-white hover:bg-primary/90',
          ].join(' ')}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  )
}
