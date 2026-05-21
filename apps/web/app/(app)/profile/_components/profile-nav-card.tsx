'use client'

import { useRouter } from 'next/navigation'
import { ChevronRight, Lock } from 'lucide-react'
import { type ReactNode } from 'react'

interface ProfileNavCardProps {
  href: string
  icon: ReactNode
  title: string
  hint: string
  variant?: 'default' | 'primary'
  proBadge?: boolean
  proBadgeLabel?: string
  dataTour?: string
  onNavigate?: (event: React.MouseEvent<HTMLButtonElement>) => void
}

/** v8 settings-row style profile nav: flush row with hairline bottom, label + hint stacked. */
export function ProfileNavCard({
  href,
  title,
  hint,
  variant = 'default',
  proBadge = false,
  proBadgeLabel,
  dataTour,
  onNavigate,
}: Readonly<ProfileNavCardProps>) {
  const router = useRouter()
  const isPrimary = variant === 'primary'

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    onNavigate?.(event)
    if (event.defaultPrevented) return
    router.push(href)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      data-tour={dataTour}
      data-testid={isPrimary ? 'profile-primary-card' : undefined}
      className="w-full text-left flex items-center cursor-pointer"
      style={{
        padding: '14px 20px',
        gap: 12,
        background: 'transparent',
        appearance: 'none',
        border: 0,
        borderBottom: '1px solid var(--hairline)',
      }}
    >
      <div className="flex-1 min-w-0 flex items-center" style={{ gap: 10 }}>
        <span
          className="overflow-hidden whitespace-nowrap text-ellipsis"
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 15,
            fontWeight: 400,
            color: 'var(--fg-1)',
          }}
        >
          {title}
        </span>
        {proBadge && (
          <span
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--fg-on-primary)',
              background: 'var(--primary)',
              padding: '2px 6px',
              borderRadius: 4,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {proBadgeLabel ?? 'Pro'}
          </span>
        )}
        {isPrimary && !proBadge && (
          <Lock size={12} strokeWidth={1.5} color="var(--fg-4)" />
        )}
      </div>
      <div className="flex items-center shrink-0" style={{ gap: 8, color: 'var(--fg-3)' }}>
        <span
          className="overflow-hidden whitespace-nowrap text-ellipsis"
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 13,
            color: 'var(--fg-3)',
            maxWidth: 200,
          }}
        >
          {hint}
        </span>
        <ChevronRight size={16} strokeWidth={1.5} color="var(--fg-4)" />
      </div>
    </button>
  )
}
