'use client'

import { type ElementType, type ComponentPropsWithoutRef } from 'react'

type SurfaceVariant = 'default' | 'elevated' | 'interactive' | 'selection' | 'glass'

interface SurfaceCardOwnProps<T extends ElementType = 'div'> {
  as?: T
  variant?: SurfaceVariant
  active?: boolean
  padding?: 'default' | 'compact' | 'none'
}

type SurfaceCardProps<T extends ElementType = 'div'> = SurfaceCardOwnProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof SurfaceCardOwnProps<T>>

const variantClasses: Record<SurfaceVariant, string> = {
  default:
    'bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)]',
  elevated:
    'bg-surface-elevated rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-md)]',
  interactive:
    'bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] surface-interactive cursor-pointer',
  selection: 'rounded-[var(--radius-xl)] border-2 transition-all duration-200',
  glass:
    'bg-[rgba(var(--primary-shadow),0.03)] backdrop-blur-[24px] backdrop-saturate-150 rounded-[var(--radius-xl)] border border-border-muted',
}

const selectionActiveClasses =
  'border-primary bg-primary/8 shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.1)]'
const selectionInactiveClasses =
  'border-border-muted bg-surface-elevated/50 hover:border-border hover:bg-surface-elevated'

const paddingClasses: Record<NonNullable<SurfaceCardOwnProps['padding']>, string> = {
  default: 'p-5',
  compact: 'p-4',
  none: 'p-0',
}

export function SurfaceCard<T extends ElementType = 'div'>({
  as,
  variant = 'default',
  active = false,
  padding = 'default',
  className,
  children,
  ...rest
}: SurfaceCardProps<T>) {
  const Tag: ElementType = as ?? 'div'

  let selectionClass = ''
  if (variant === 'selection') {
    selectionClass = active ? selectionActiveClasses : selectionInactiveClasses
  }

  const classes = [variantClasses[variant], selectionClass, paddingClasses[padding], className]
    .filter(Boolean)
    .join(' ')

  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  )
}
