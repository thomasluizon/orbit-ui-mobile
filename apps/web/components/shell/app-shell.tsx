'use client'

import { useEffect, useMemo, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { BarChart3, CalendarDays, Compass, Home, Infinity as InfinityIcon, ListTodo, Target, User, Users } from 'lucide-react'
import { AstraMark } from '@/components/ui/astra-avatar'
import {
  AppSidebar,
  type SidebarNavItem,
  type SidebarSection,
} from '@/components/navigation/app-sidebar'
import { CommandPalette } from '@/components/command/command-palette'
import { useProfile } from '@/hooks/use-profile'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { setRouteTransitionIntent } from '@/lib/motion/route-intent'
import { useUIStore } from '@/stores/ui-store'
import { useShellStore } from '@/stores/shell-store'
import { AstraCopilotRail } from './astra-copilot-rail'
import { DesktopTopbar } from './desktop-topbar'
import { InAppShellProvider } from './in-app-shell-context'
import { RailDrawer } from './rail-drawer'
import { RightRail } from './right-rail'
import { TodayRail } from './today-rail'
import { TopbarSlotProvider } from './topbar-slot'
import { resolveTopbarTitleKey } from './topbar-title'

interface AppShellProps {
  children: ReactNode
  onCreate: () => void
}

type HabitSubView = 'today' | 'all' | 'general'

/**
 * Desktop application shell (≥768px): a full-bleed three-column layout — sidebar
 * (left edge) | main (flex, min-w-0, content centered at `--content-max-w`) | contextual
 * right rail (right edge). Main carries the full-width gradient header and a topbar.
 * Below 768px it collapses to the single content column (sidebar, rail, and topbar hide
 * themselves), leaving the phone layout untouched. Today/Goals are `activeView` switches
 * on `/`, not routes.
 */
export function AppShell({ children, onCreate }: Readonly<AppShellProps>) {
  const t = useTranslations()
  const router = useRouter()
  const pathname = usePathname()
  const { profile } = useProfile()
  const hasProAccess = profile?.hasProAccess ?? false
  const activeView = useUIStore((state) => state.activeView)
  const setActiveView = useUIStore((state) => state.setActiveView)
  const sidebarCollapsed = useShellStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useShellStore((state) => state.toggleSidebar)
  const railOpen = useShellStore((state) => state.railOpen)
  const setRailOpen = useShellStore((state) => state.setRailOpen)
  const setAstraOpen = useShellStore((state) => state.setAstraOpen)
  const setAstraMaximized = useShellStore((state) => state.setAstraMaximized)
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
  const isWideRoute = pathname.startsWith('/calendar') && !pathname.startsWith('/calendar-sync')

  const navigateTab = useMemo(
    () => (path: string) => {
      setAstraMaximized(false)
      setRouteTransitionIntent('tab')
      router.push(path)
    },
    [router, setAstraMaximized],
  )

  const selectHabitView = useMemo(
    () => (view: HabitSubView) => {
      setActiveView(view)
      navigateTab('/')
    },
    [navigateTab, setActiveView],
  )

  const openGoals = useMemo(
    () => () => {
      if (!hasProAccess) {
        setRouteTransitionIntent('forward')
        router.push('/upgrade')
        return
      }
      setActiveView('goals')
      navigateTab('/')
    },
    // react-doctor-disable-next-line exhaustive-deps -- hasProAccess aliases profile.hasProAccess and is already in deps; react-doctor does not resolve the alias; https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    [router, navigateTab, setActiveView, hasProAccess],
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
        onSelect: () => navigateTab('/calendar'),
      },
      {
        id: 'goals',
        label: t('nav.goals'),
        icon: Target,
        active: goalsActive,
        onSelect: openGoals,
      },
      {
        id: 'social',
        label: t('nav.social'),
        icon: Users,
        active: pathname.startsWith('/social'),
        onSelect: () => navigateTab('/social'),
      },
      {
        id: 'insights',
        label: t('nav.insights'),
        icon: BarChart3,
        active: pathname.startsWith('/insights'),
        onSelect: () => navigateTab('/insights'),
      },
      {
        id: 'astra',
        label: t('nav.astra'),
        icon: AstraMark,
        active: false,
        onSelect: () => {
          setAstraOpen(true)
          setAstraMaximized(true)
        },
      },
      {
        id: 'explore',
        label: t('nav.explore'),
        icon: Compass,
        active: pathname.startsWith('/explore'),
        onSelect: () => navigateTab('/explore'),
      },
      {
        id: 'profile',
        label: t('nav.profile'),
        icon: User,
        active: pathname.startsWith('/profile'),
        onSelect: () => navigateTab('/profile'),
      },
    ],
    [
      t,
      navigateTab,
      pathname,
      onHome,
      activeView,
      habitsActive,
      goalsActive,
      selectHabitView,
      openGoals,
      setAstraOpen,
      setAstraMaximized,
    ],
  )

  const commandItems = useMemo<SidebarNavItem[]>(
    () => [
      { id: 'today', label: t('habits.viewToday'), icon: Home, onSelect: () => selectHabitView('today') },
      { id: 'all', label: t('habits.viewAll'), icon: ListTodo, onSelect: () => selectHabitView('all') },
      { id: 'general', label: t('habits.viewGeneral'), icon: InfinityIcon, onSelect: () => selectHabitView('general') },
      { id: 'calendar', label: t('nav.calendar'), icon: CalendarDays, onSelect: () => navigateTab('/calendar') },
      { id: 'goals', label: t('nav.goals'), icon: Target, onSelect: openGoals },
      { id: 'social', label: t('nav.social'), icon: Users, onSelect: () => navigateTab('/social') },
      { id: 'insights', label: t('nav.insights'), icon: BarChart3, onSelect: () => navigateTab('/insights') },
      {
        id: 'astra',
        label: t('nav.astra'),
        icon: AstraMark,
        onSelect: () => {
          setAstraOpen(true)
          setAstraMaximized(true)
        },
      },
      { id: 'explore', label: t('nav.explore'), icon: Compass, onSelect: () => navigateTab('/explore') },
      { id: 'profile', label: t('nav.profile'), icon: User, onSelect: () => navigateTab('/profile') },
    ],
    [t, navigateTab, selectHabitView, openGoals, setAstraOpen, setAstraMaximized],
  )

  const topbarTitle = useMemo(() => {
    const titleKey = resolveTopbarTitleKey(pathname, onHome)
    return titleKey ? t(titleKey) : ''
  }, [t, pathname, onHome])

  const railContent = onHome && !goalsActive ? <TodayRail /> : null

  return (
    <TopbarSlotProvider>
      <InAppShellProvider>
        <div className="md:flex">
          <AppSidebar
            sections={sidebarSections}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={toggleSidebar}
            collapseLabel={t('shell.collapseSidebar')}
            expandLabel={t('shell.expandSidebar')}
            onCreate={onCreate}
            createLabel={t('nav.create')}
            brandLabel="Orbit"
            navLabel={t('nav.mainNavigation')}
            account={
              profile
                ? {
                    name: profile.name,
                    planLabel: hasProAccess ? t('profile.subscription.pro') : t('profile.subscription.free'),
                    onOpen: () => navigateTab('/profile'),
                    ariaLabel: t('nav.profile'),
                  }
                : undefined
            }
          />

          <main className="relative z-10 min-w-0 flex-1 md:[container-type:inline-size]">
            <div className={`mx-auto max-w-[var(--app-max-w)] px-[var(--app-px)] md:relative md:z-[1] md:px-8 xl:px-10 md:pb-16 ${isWideRoute ? 'md:max-w-[var(--content-max-w)]' : ''}`}>
              <DesktopTopbar title={topbarTitle} showRailToggle={!!railContent} />
              {children}
            </div>
          </main>

          {railContent && <RightRail ariaLabel={t('rail.todayProgress')}>{railContent}</RightRail>}

          <RailDrawer open={railOpen && !!railContent} onClose={() => setRailOpen(false)}>
            {railContent}
          </RailDrawer>

          <AstraCopilotRail hideLauncher={!!railContent} />

          <CommandPalette
            navItems={commandItems}
            onCreateHabit={() => setShowCreateModal(true)}
            onCreateGoal={() => {
              if (!hasProAccess) {
                setRouteTransitionIntent('forward')
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
