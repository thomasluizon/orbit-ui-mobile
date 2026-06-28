'use client'

import { ThemeToggle } from '@/components/ui/theme-toggle'
import { StreakBadge } from '@/components/gamification/streak-badge'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { useProfile } from '@/hooks/use-profile'
import { useIsDesktop } from '@/components/goals/use-is-desktop'
import { useTopbarSlotNode } from './topbar-slot'

interface DesktopTopbarProps {
  title: string
}

/**
 * Slim sticky bar at the top of the main column on desktop (≥768px). Left holds
 * the page-contributed slot (Today's date navigation) or the page title; right
 * clusters the theme toggle, streak flame, and notification bell relocated from
 * the mobile TodayHeader. Sits over the gradient header. Rendered only at/above md
 * so its tour-tagged controls never shadow the phone header's in the mobile DOM.
 */
export function DesktopTopbar({ title }: Readonly<DesktopTopbarProps>) {
  const { profile } = useProfile()
  const slotNode = useTopbarSlotNode()
  const isDesktop = useIsDesktop()

  if (!isDesktop) return null

  return (
    <div
      className="relative z-[1] flex items-center justify-between"
      style={{ minHeight: 56, gap: 12, paddingBlock: 8 }}
    >
      <div className="flex min-w-0 flex-1 items-center">
        {slotNode ?? (
          <h1
            className="truncate"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              color: 'var(--fg-1)',
              textWrap: 'balance',
            }}
          >
            {title}
          </h1>
        )}
      </div>
      <div className="flex shrink-0 items-center" style={{ gap: 10 }}>
        <ThemeToggle />
        <StreakBadge streak={profile?.currentStreak ?? 0} />
        <NotificationBell />
      </div>
    </div>
  )
}
