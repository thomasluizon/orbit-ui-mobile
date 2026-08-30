'use client'

import { useCallback, useMemo, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ShellWideItem } from '@orbit/shared/contracts/shell'
import { resolveShellDestination } from '@orbit/shared/utils'
import { CalendarDays, ChartLine, Home, Plus, User } from '@/components/ui/icons'
import { CommandPalette, type CommandNavigationItem } from '@/components/command/command-palette'
import { BottomTabBar, type BottomTab } from '@/components/navigation/bottom-tab-bar'
import { Fab } from '@/components/ui/fab'
import { useIsWideDesktop } from '@/hooks/use-is-desktop'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { useProfile } from '@/hooks/use-profile'
import { useShellStore } from '@/stores/shell-store'
import { useUIStore } from '@/stores/ui-store'
import {
  resetRouteTransitionIntent,
  setRouteTransitionIntent,
} from '@/lib/motion/route-intent'
import { Shell412 } from './shell-412'
import { ShellWide } from './shell-wide'

interface DestinationShellProps {
  children: ReactNode
  notice?: ReactNode
  composer?: ReactNode
  onCreate: () => void
}

const ROUTES: Record<BottomTab, string> = {
  hoje: '/',
  calendario: '/calendar',
  progresso: '/progress',
  perfil: '/profile',
}

function hasPrimaryNavigation(pathname: string): boolean {
  return pathname !== '/upgrade'
}

export function DestinationShell({
  children,
  notice,
  composer,
  onCreate,
}: Readonly<DestinationShellProps>) {
  const t = useTranslations()
  const router = useRouter()
  const pathname = usePathname()
  const wide = useIsWideDesktop()
  const { profile } = useProfile()
  const setPaletteOpen = useShellStore((state) => state.setPaletteOpen)
  const setShowCreateModal = useUIStore((state) => state.setShowCreateModal)
  const destination = resolveShellDestination(pathname)
  const navigationEnabled = hasPrimaryNavigation(pathname)

  useKeyboardShortcuts(navigationEnabled)

  const labels = useMemo<Record<BottomTab, string>>(
    () => ({
      hoje: t('nav.today'),
      calendario: t('nav.calendar'),
      progresso: t('nav.progress'),
      perfil: t('nav.profile'),
    }),
    [t],
  )

  const navigate = useCallback(
    (id: BottomTab) => {
      const route = ROUTES[id]
      if (route === pathname) {
        resetRouteTransitionIntent()
        return
      }
      setRouteTransitionIntent('tab')
      router.push(route)
    },
    [pathname, router],
  )

  const wideItems = useMemo<ShellWideItem[]>(
    () => [
      { id: 'hoje', label: labels.hoje, icon: 'home' },
      { id: 'calendario', label: labels.calendario, icon: 'calendar' },
      { id: 'progresso', label: labels.progresso, icon: 'chart-line' },
      { id: 'perfil', label: labels.perfil, icon: 'user' },
    ],
    [labels],
  )

  const commandItems = useMemo<CommandNavigationItem[]>(
    () => [
      { id: 'hoje', label: labels.hoje, icon: Home, onSelect: () => navigate('hoje') },
      {
        id: 'calendario',
        label: labels.calendario,
        icon: CalendarDays,
        onSelect: () => navigate('calendario'),
      },
      {
        id: 'progresso',
        label: labels.progresso,
        icon: ChartLine,
        onSelect: () => navigate('progresso'),
      },
      { id: 'perfil', label: labels.perfil, icon: User, onSelect: () => navigate('perfil') },
    ],
    [labels, navigate],
  )

  const palette = (
    <CommandPalette
      navItems={commandItems}
      onCreateHabit={() => setShowCreateModal(true)}
    />
  )

  if (!navigationEnabled) {
    const flow = wide ? (
      <ShellWide nav={false} notice={notice}>
        {children}
      </ShellWide>
    ) : (
      <Shell412 nav={false} notice={notice}>
        {children}
      </Shell412>
    )
    return flow
  }

  if (wide) {
    return (
      <>
        <a
          href="#orbit-main"
          className="z-tooltip fixed left-4 top-4 -translate-y-24 rounded-[8px] bg-[var(--fg-1)] px-4 py-3 text-[var(--bg)] focus:translate-y-0"
        >
          {t('common.skipToContent')}
        </a>
        <ShellWide
          items={wideItems}
          activeId={destination}
          navLabel={t('nav.mainNavigation')}
          onSelect={(id) => navigate(id as BottomTab)}
          onCreate={onCreate}
          createLabel={t('nav.create')}
          account={profile?.email}
          onPalette={() => setPaletteOpen(true)}
          paletteLabel={t('command.title')}
          paletteHint="Ctrl K"
          notice={notice}
          composer={composer}
        >
          <div id="orbit-main">{children}</div>
        </ShellWide>
        {palette}
      </>
    )
  }

  return (
    <>
      <Shell412
        tabBar={
          <BottomTabBar
            active={destination}
            labels={labels}
            navLabel={t('nav.mainNavigation')}
            onTab={navigate}
          />
        }
        fab={
          pathname === '/' ? (
            <Fab label={t('nav.create')} onClick={onCreate}>
              <Plus size={24} strokeWidth={2} aria-hidden="true" />
            </Fab>
          ) : undefined
        }
        notice={notice}
        composer={composer}
      >
        {children}
      </Shell412>
      {palette}
    </>
  )
}
