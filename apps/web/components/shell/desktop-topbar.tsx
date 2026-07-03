'use client'

import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { StreakBadge } from '@/components/gamification/streak-badge'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { useProfile } from '@/hooks/use-profile'
import { useStreakInfo } from '@/hooks/use-gamification'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import { useShellStore } from '@/stores/shell-store'
import { RailToggle } from './rail-drawer'
import { useTopbarSlotNode } from './topbar-slot'

interface DesktopTopbarProps {
  title: string
  /** Renders the rail-drawer toggle as the cluster's last control (home only, md..xl). */
  showRailToggle?: boolean
}

function PaletteTrigger() {
  const t = useTranslations()
  const togglePalette = useShellStore((state) => state.togglePalette)
  const [isApplePlatform] = useState(
    () => typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform),
  )

  return (
    <button
      type="button"
      onClick={togglePalette}
      aria-label={t('shell.openPalette')}
      aria-haspopup="dialog"
      className="icon-btn icon-btn-ring icon-btn-well"
      style={{ width: 'auto', gap: 7, paddingInline: 11 }}
    >
      <Search size={20} strokeWidth={1.8} aria-hidden />
      <kbd className="t-meta" style={{ color: 'var(--fg-4)' }}>
        {isApplePlatform ? '⌘K' : 'Ctrl K'}
      </kbd>
    </button>
  )
}

/**
 * Sticky command strip at the top of the main column on desktop (≥768px). Left holds
 * the page-contributed slot (Today's date navigation) or the page title; right
 * clusters the palette trigger, theme toggle, streak flame, notification bell, and
 * (on home, md..xl) the rail-drawer toggle. The bar shell always renders (`hidden
 * md:flex`) so its 56px is reserved at first paint; the tour-tagged cluster contents
 * stay gated to desktop so they never shadow the phone header's in the mobile DOM.
 * A 1px sentinel flips the bar from transparent-over-gradient to opaque + hairline
 * once it sticks.
 */
export function DesktopTopbar({ title, showRailToggle = false }: Readonly<DesktopTopbarProps>) {
  const { profile } = useProfile()
  const { data: streakInfo } = useStreakInfo(profile?.canViewGamification ?? false)
  const slotNode = useTopbarSlotNode()
  const isDesktop = useIsDesktop()
  const [stuck, setStuck] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(([entry]) => {
      setStuck(entry ? !entry.isIntersecting : false)
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="hidden md:block" style={{ height: 1, marginBottom: -1 }} />
      <div
        className="desktop-topbar-divider sticky top-0 z-[5] hidden items-center justify-between md:flex"
        data-stuck={stuck ? 'true' : 'false'}
        style={{
          minHeight: 56,
          gap: 12,
          paddingBlock: 8,
          background: stuck ? 'color-mix(in srgb, var(--bg) 78%, transparent)' : 'transparent',
          backdropFilter: stuck ? 'blur(12px)' : 'none',
          WebkitBackdropFilter: stuck ? 'blur(12px)' : 'none',
          transition: 'background-color var(--dur-fast) var(--ease-standard)',
        }}
      >
        <div className="flex min-w-0 flex-1 items-center">
          {slotNode ?? (title ? <h1 className="t-h2 truncate">{title}</h1> : null)}
        </div>
        <div className="flex shrink-0 items-center" style={{ gap: 10 }}>
          {isDesktop && (
            <>
              <PaletteTrigger />
              <ThemeToggle />
              <StreakBadge streak={profile?.currentStreak ?? 0} isFrozen={streakInfo?.isFrozenToday ?? false} />
              <NotificationBell />
              {showRailToggle && (
                <span className="inline-flex xl:hidden">
                  <RailToggle />
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
