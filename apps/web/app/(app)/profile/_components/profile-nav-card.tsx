'use client'

import { useId, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

interface ProfileNavCardProps {
  href: string
  icon: ReactNode
  title: string
  hint: string
  variant?: 'default' | 'primary'
  proBadge?: boolean
  proBadgeLabel?: string
}

export function ProfileNavCard({
  href,
  icon,
  title,
  hint,
  variant = 'default',
  proBadge = false,
  proBadgeLabel,
}: Readonly<ProfileNavCardProps>) {
  const isPrimary = variant === 'primary'
  const titleId = useId()
  const hintId = useId()

  return (
    <Link
      href={href}
      aria-labelledby={titleId}
      aria-describedby={hintId}
      className={`w-full rounded-[var(--radius-xl)] border p-5 flex items-center gap-4 text-left shadow-[var(--shadow-sm)] transition-all duration-200 group ${
        isPrimary
          ? 'bg-primary/10 border-primary/20 hover:bg-primary/15 hover:border-primary/30 hover:shadow-[var(--shadow-md)]'
          : 'bg-surface border-border-muted hover:bg-surface-elevated hover:shadow-[var(--shadow-md)] hover:border-border'
      }`}
    >
      <div
        className={`shrink-0 flex items-center justify-center rounded-[var(--radius-lg)] p-3 transition-colors ${
          isPrimary ? 'bg-primary/20 group-hover:bg-primary/30' : 'bg-primary/10'
        }`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p id={titleId} className="text-sm font-bold text-text-primary">
            {title}
          </p>
          {proBadge && (
            <span className="text-[9px] font-bold uppercase tracking-wider bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
              {proBadgeLabel}
            </span>
          )}
        </div>
        <p id={hintId} className="text-xs text-text-secondary mt-0.5">
          {hint}
        </p>
      </div>
      <ChevronRight
        className={`size-4 text-text-muted shrink-0 transition-colors ${
          isPrimary ? 'group-hover:text-primary' : 'group-hover:text-text-primary'
        }`}
      />
    </Link>
  )
}
