'use client'

import { useTranslations } from 'next-intl'
import { SearchHeaderAction } from '@/components/search/search-header-action'
import { AppBar } from '@/components/ui/app-bar'
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
      <AppBar title={t('nav.profile')} action={<SearchHeaderAction />} />
      <div data-testid="profile-header-actions" className="flex shrink-0 items-center justify-end gap-3 px-4 pb-3">
        <ThemeToggle />
        <span data-tour="tour-streak-badge">
          <StreakBadge streak={streak} isFrozen={streakInfo?.isFrozenToday ?? false} />
        </span>
        <NotificationBell />
      </div>

      {error && (
        <p
          style={{
            padding: '12px 16px',
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
