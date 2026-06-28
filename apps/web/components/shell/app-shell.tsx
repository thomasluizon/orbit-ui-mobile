'use client'

import { useEffect, useMemo, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { BarChart3, CalendarDays, Home, Target, User } from 'lucide-react'
import { AstraMark } from '@/components/ui/astra-avatar'
import { AppSidebar, type SidebarNavItem } from '@/components/navigation/app-sidebar'
import { CommandPalette } from '@/components/command/command-palette'
import { useProfile } from '@/hooks/use-profile'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { useUIStore } from '@/stores/ui-store'
import { useShellStore } from '@/stores/shell-store'
import { AstraCopilotRail } from './astra-copilot-rail'
import { RailDrawer, RailToggle } from './rail-drawer'
import { RightRail } from './right-rail'
import { TodayRail } from './today-rail'

interface AppShellProps {
  children: ReactNode
  onCreate: () => void
}

/**
 * Desktop application shell (≥768px): left sidebar + centered content + contextual
 * right rail, capped and centered at `--shell-max-w`. Below 768px it collapses to the
 * single content column (the sidebar and rail hide themselves), leaving the phone
 * layout untouched. Today/Goals are `activeView` switches on `/`, not routes.
 */
export function AppShell({ children, onCreate }: Readonly<AppShellProps>) {
  const t = useTranslations()
  const router = useRouter()
  const pathname = usePathname() ?? '/'
  const { profile } = useProfile()
  const hasProAccess = profile?.hasProAccess ?? false
  const activeView = useUIStore((state) => state.activeView)
  const setActiveView = useUIStore((state) => state.setActiveView)
  const sidebarCollapsed = useShellStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useShellStore((state) => state.toggleSidebar)
  const railOpen = useShellStore((state) => state.railOpen)
  const setRailOpen = useShellStore((state) => state.setRailOpen)
  const setShowCreateModal = useUIStore((state) => state.setShowCreateModal)
  const setShowCreateGoalModal = useUIStore((state) => state.setShowCreateGoalModal)

  useKeyboardShortcuts()

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1280px)')
    if (query.matches) setRailOpen(false)
    const handleBreakpointChange = (event: MediaQueryListEvent) => {
      if (event.matches) setRailOpen(false)
    }
    query.addEventListener('change', handleBreakpointChange)
    return () => query.removeEventListener('change', handleBreakpointChange)
  }, [setRailOpen])

  const items = useMemo<SidebarNavItem[]>(
    () => [
      {
        id: 'today',
        label: t('nav.today'),
        icon: Home,
        onSelect: () => {
          setActiveView('today')
          router.push('/')
        },
      },
      {
        id: 'calendar',
        label: t('nav.calendar'),
        icon: CalendarDays,
        onSelect: () => router.push('/calendar'),
      },
      {
        id: 'goals',
        label: t('nav.goals'),
        icon: Target,
        onSelect: () => {
          if (!hasProAccess) {
            router.push('/upgrade')
            return
          }
          setActiveView('goals')
          router.push('/')
        },
      },
      {
        id: 'insights',
        label: t('nav.insights'),
        icon: BarChart3,
        onSelect: () => router.push('/insights'),
      },
      {
        id: 'astra',
        label: t('nav.astra'),
        icon: AstraMark,
        onSelect: () => router.push('/chat'),
      },
      {
        id: 'profile',
        label: t('nav.profile'),
        icon: User,
        onSelect: () => router.push('/profile'),
      },
    ],
    [t, router, setActiveView, hasProAccess],
  )

  const activeId = useMemo(() => {
    if (pathname === '/') return activeView === 'goals' ? 'goals' : 'today'
    if (pathname.startsWith('/calendar')) return 'calendar'
    if (pathname.startsWith('/insights')) return 'insights'
    if (pathname.startsWith('/chat')) return 'astra'
    if (pathname.startsWith('/profile')) return 'profile'
    return ''
  }, [pathname, activeView])

  const railContent = pathname === '/' ? <TodayRail /> : null

  return (
    <div className="md:mx-auto md:flex md:max-w-[var(--shell-max-w)]">
      <AppSidebar
        items={items}
        activeId={activeId}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
        collapseLabel={t('shell.collapseSidebar')}
        expandLabel={t('shell.expandSidebar')}
        onCreate={onCreate}
        createLabel={t('nav.create')}
        brandLabel="Orbit"
      />

      <main className="relative z-10 min-w-0 flex-1">
        <div className="mx-auto max-w-[var(--app-max-w)] px-[var(--app-px)] md:max-w-[680px] md:px-8">
          {children}
        </div>
      </main>

      {railContent && <RightRail ariaLabel={t('rail.todayProgress')}>{railContent}</RightRail>}

      {railContent && <RailToggle />}
      <RailDrawer open={railOpen && !!railContent} onClose={() => setRailOpen(false)}>
        {railContent}
      </RailDrawer>

      <AstraCopilotRail />

      <CommandPalette
        navItems={items}
        onCreateHabit={() => setShowCreateModal(true)}
        onCreateGoal={() => {
          if (!hasProAccess) {
            router.push('/upgrade')
            return
          }
          setShowCreateGoalModal(true)
        }}
      />
    </div>
  )
}
