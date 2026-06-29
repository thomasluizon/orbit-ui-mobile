'use client'

import { useEffect, useMemo, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { BarChart3, CalendarDays, Home, Target, User } from 'lucide-react'
import { AstraMark } from '@/components/ui/astra-avatar'
import {
  AppSidebar,
  type SidebarNavItem,
  type SidebarSection,
} from '@/components/navigation/app-sidebar'
import { CommandPalette } from '@/components/command/command-palette'
import { useProfile } from '@/hooks/use-profile'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { useUIStore } from '@/stores/ui-store'
import { useShellStore } from '@/stores/shell-store'
import { AstraCopilotRail } from './astra-copilot-rail'
import { DesktopTopbar } from './desktop-topbar'
import { InAppShellProvider } from './in-app-shell-context'
import { RailDrawer, RailToggle } from './rail-drawer'
import { RightRail } from './right-rail'
import { TodayRail } from './today-rail'
import { TopbarSlotProvider } from './topbar-slot'

interface AppShellProps {
  children: ReactNode
  onCreate: () => void
}

type HabitSubView = 'today' | 'all' | 'general'

/**
 * Desktop application shell (≥768px): a real three-column layout filling
 * `--shell-max-w` — sidebar | main (flex, min-w-0) | contextual right rail — with
 * each page owning its own content width (no global cap). Main carries the gradient
 * header and a sticky topbar. Below 768px it collapses to the single content column
 * (sidebar, rail, and topbar hide themselves), leaving the phone layout untouched.
 * Today/Goals are `activeView` switches on `/`, not routes.
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

  const onHome = pathname === '/'
  const goalsActive = onHome && activeView === 'goals'
  const habitsActive = onHome && activeView !== 'goals'

  const selectHabitView = useMemo(
    () => (view: HabitSubView) => {
      setActiveView(view)
      router.push('/')
    },
    [router, setActiveView],
  )

  const openGoals = useMemo(
    () => () => {
      if (!hasProAccess) {
        router.push('/upgrade')
        return
      }
      setActiveView('goals')
      router.push('/')
    },
    [router, setActiveView, hasProAccess],
  )

  const sidebarSections = useMemo<SidebarSection[]>(
    () => [
      {
        id: 'habits',
        label: t('nav.habits'),
        icon: Home,
        active: habitsActive,
        expanded: habitsActive,
        onSelect: () => selectHabitView('today'),
        children: [
          {
            id: 'today',
            label: t('habits.viewToday'),
            active: onHome && activeView === 'today',
            onSelect: () => selectHabitView('today'),
          },
          {
            id: 'all',
            label: t('habits.viewAll'),
            active: onHome && activeView === 'all',
            onSelect: () => selectHabitView('all'),
          },
          {
            id: 'general',
            label: t('habits.viewGeneral'),
            active: onHome && activeView === 'general',
            onSelect: () => selectHabitView('general'),
          },
        ],
      },
      {
        id: 'calendar',
        label: t('nav.calendar'),
        icon: CalendarDays,
        active: pathname.startsWith('/calendar'),
        onSelect: () => router.push('/calendar'),
      },
      {
        id: 'goals',
        label: t('nav.goals'),
        icon: Target,
        active: goalsActive,
        onSelect: openGoals,
      },
      {
        id: 'insights',
        label: t('nav.insights'),
        icon: BarChart3,
        active: pathname.startsWith('/insights'),
        onSelect: () => router.push('/insights'),
      },
      {
        id: 'astra',
        label: t('nav.astra'),
        icon: AstraMark,
        active: pathname.startsWith('/chat'),
        onSelect: () => router.push('/chat'),
      },
      {
        id: 'profile',
        label: t('nav.profile'),
        icon: User,
        active: pathname.startsWith('/profile'),
        onSelect: () => router.push('/profile'),
      },
    ],
    [
      t,
      router,
      pathname,
      onHome,
      activeView,
      habitsActive,
      goalsActive,
      selectHabitView,
      openGoals,
    ],
  )

  const commandItems = useMemo<SidebarNavItem[]>(
    () => [
      { id: 'today', label: t('habits.viewToday'), icon: Home, onSelect: () => selectHabitView('today') },
      { id: 'all', label: t('habits.viewAll'), icon: Home, onSelect: () => selectHabitView('all') },
      { id: 'general', label: t('habits.viewGeneral'), icon: Home, onSelect: () => selectHabitView('general') },
      { id: 'calendar', label: t('nav.calendar'), icon: CalendarDays, onSelect: () => router.push('/calendar') },
      { id: 'goals', label: t('nav.goals'), icon: Target, onSelect: openGoals },
      { id: 'insights', label: t('nav.insights'), icon: BarChart3, onSelect: () => router.push('/insights') },
      { id: 'astra', label: t('nav.astra'), icon: AstraMark, onSelect: () => router.push('/chat') },
      { id: 'profile', label: t('nav.profile'), icon: User, onSelect: () => router.push('/profile') },
    ],
    [t, router, selectHabitView, openGoals],
  )

  const topbarTitle = useMemo(() => {
    if (onHome) return ''
    if (pathname.startsWith('/calendar-sync')) return t('calendar.title')
    if (pathname.startsWith('/calendar')) return t('nav.calendar')
    if (pathname.startsWith('/insights')) return t('nav.insights')
    if (pathname.startsWith('/chat')) return t('nav.astra')
    if (pathname.startsWith('/profile')) return t('nav.profile')
    if (pathname.startsWith('/preferences')) return t('preferences.title')
    if (pathname.startsWith('/ai-settings')) return t('aiSettings.title')
    if (pathname.startsWith('/advanced')) return t('advancedSettings.title')
    if (pathname.startsWith('/about')) return t('about.title')
    if (pathname.startsWith('/support')) return t('profile.support.title')
    if (pathname.startsWith('/achievements')) return t('gamification.title')
    if (pathname.startsWith('/streak')) return t('streakDisplay.detail.title')
    if (pathname.startsWith('/retrospective')) return t('retrospective.title')
    if (pathname.startsWith('/upgrade')) return t('upgrade.title')
    return ''
  }, [t, pathname, onHome])

  const railContent = onHome ? <TodayRail /> : null

  return (
    <TopbarSlotProvider>
      <InAppShellProvider>
        <div className="md:mx-auto md:flex md:max-w-[var(--shell-max-w)]">
          <AppSidebar
            sections={sidebarSections}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={toggleSidebar}
            collapseLabel={t('shell.collapseSidebar')}
            expandLabel={t('shell.expandSidebar')}
            onCreate={onCreate}
            createLabel={t('nav.create')}
            brandLabel="Orbit"
          />

          <main className="relative z-10 min-w-0 flex-1">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 -z-10 hidden md:block"
              style={{ height: 260, background: 'var(--gradient-header)' }}
            />
            <div className="mx-auto max-w-[var(--app-max-w)] px-[var(--app-px)] md:relative md:z-[1] md:max-w-none md:px-8 xl:px-10 md:pb-16">
              <DesktopTopbar title={topbarTitle} />
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
            navItems={commandItems}
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
      </InAppShellProvider>
    </TopbarSlotProvider>
  )
}
