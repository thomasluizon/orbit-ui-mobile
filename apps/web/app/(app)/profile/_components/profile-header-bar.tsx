'use client'

import { User } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AppBar } from '@/components/ui/app-bar'
import { GradientTop } from '@/components/ui/gradient-top'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { StreakBadge } from '@/components/gamification/streak-badge'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { useProfile } from '@/hooks/use-profile'
import { useStreakInfo } from '@/hooks/use-gamification'

interface ProfileHeaderBarProps {
  streak: number
  error: unknown
}

export function ProfileHeaderBar({ streak, error }: Readonly<ProfileHeaderBarProps>) {
  const t = useTranslations()
  const { profile } = useProfile()
  const { data: streakInfo } = useStreakInfo(profile?.canViewGamification ?? false)

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -z-10 md:hidden"
        style={{
          left: 'calc(var(--app-px) * -1)',
          right: 'calc(var(--app-px) * -1)',
        }}
      >
        <GradientTop height={300} />
      </div>

      <AppBar
        leadingIcon={<User size={22} strokeWidth={1.8} color="var(--fg-1)" />}
        trailing={
          <>
            <ThemeToggle />
            <span data-tour="tour-streak-badge">
              <StreakBadge streak={streak} isFrozen={streakInfo?.isFrozenToday ?? false} />
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
