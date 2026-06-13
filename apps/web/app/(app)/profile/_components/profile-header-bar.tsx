'use client'

import { User } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AppBar } from '@/components/ui/app-bar'
import { GradientTop } from '@/components/ui/gradient-top'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { StreakBadge } from '@/components/gamification/streak-badge'
import { NotificationBell } from '@/components/navigation/notification-bell'

interface ProfileHeaderBarProps {
  streak: number
  error: unknown
}

export function ProfileHeaderBar({ streak, error }: Readonly<ProfileHeaderBarProps>) {
  const t = useTranslations()

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -z-10"
        style={{
          left: 'calc(var(--app-px) * -1)',
          right: 'calc(var(--app-px) * -1)',
        }}
      >
        <GradientTop height={300} />
      </div>

      <AppBar
        leadingIcon={<User size={17} strokeWidth={1.5} color="var(--fg-2)" />}
        trailing={
          <>
            <ThemeToggle />
            <span data-tour="tour-streak-badge">
              <StreakBadge streak={streak} />
            </span>
            <NotificationBell />
          </>
        }
      />

      {error && (
        <p
          style={{
            margin: '12px 20px',
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            color: 'var(--status-bad)',
            textAlign: 'center',
          }}
        >
          {process.env.NODE_ENV === 'development' && error instanceof Error
            ? error.message
            : t('errors.loadProfile')}
        </p>
      )}
    </>
  )
}
