'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
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
} from '@/lib/motion/route-intent'
import { Shell412 } from './shell-412'
import { ShellWide } from './shell-wide'

interface DestinationShellProps {
  children: ReactNode
  notice?: ReactNode
  composer?: ReactNode
  conversation?: ReactNode
  conversationOpen?: boolean
  conversationLabel?: string
  onCreate: () => void
}

type ComposerRenderer = () => ReactNode

interface ShellComposerSlotContextValue {
  register: (renderer: ComposerRenderer) => () => void
}

const ShellComposerSlotContext = createContext<ShellComposerSlotContextValue | null>(null)

function useShellComposerHost() {
  const [renderer, setRenderer] = useState<ComposerRenderer | null>(null)
  const register = useCallback((nextRenderer: ComposerRenderer) => {
    setRenderer(() => nextRenderer)
    return () => setRenderer(null)
  }, [])
  const value = useMemo(() => ({ register }), [register])
  return { value, content: renderer?.() }
}

export function useShellComposerSlot(
  enabled: boolean,
  renderer: ComposerRenderer,
  refreshKey: string,
) {
  const host = useContext(ShellComposerSlotContext)
  const registerRenderer = useEffectEvent(() => host?.register(renderer))

  useEffect(() => {
    if (!enabled) return
    return registerRenderer()
  }, [enabled, host, refreshKey])
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

function getAccountLabel(profile: { name: string; email: string } | null | undefined) {
  if (!profile) return undefined
  return profile.name.trim() || profile.email.split('@').at(0)?.trim() || undefined
}

export function DestinationShell({
  children,
  notice,
  composer,
  conversation,
  conversationOpen,
  conversationLabel,
  onCreate,
}: Readonly<DestinationShellProps>) {
  const registeredComposer = useShellComposerHost()

  return (
    <ShellComposerSlotContext.Provider value={registeredComposer.value}>
      <DestinationShellContent
        notice={notice}
        composer={registeredComposer.content ?? composer}
        conversation={conversation}
        conversationOpen={conversationOpen}
        conversationLabel={conversationLabel}
        onCreate={onCreate}
      >
        {children}
      </DestinationShellContent>
    </ShellComposerSlotContext.Provider>
  )
}

function DestinationShellContent({
  children,
  notice,
  composer,
  conversation,
  conversationOpen,
  conversationLabel,
  onCreate,
}: Readonly<DestinationShellProps>) {
  const t = useTranslations()
  const router = useRouter()
  const pathname = usePathname()
  const wide = useIsWideDesktop()
  const { profile } = useProfile()
  const setPaletteOpen = useShellStore((state) => state.setPaletteOpen)
  const setShowCreateModal = useUIStore((state) => state.setShowCreateModal)
  const todayFabHidden = useUIStore((state) => state.todayFabHidden)
  const destination = resolveShellDestination(pathname)
  const navigationEnabled = hasPrimaryNavigation(pathname)
  const conversationSlot = conversation !== undefined && conversationLabel
    ? { conversation, conversationOpen, conversationLabel }
    : {}

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
          {...conversationSlot}
          items={wideItems}
          activeId={destination}
          navLabel={t('nav.mainNavigation')}
          onSelect={(id) => navigate(id as BottomTab)}
          onCreate={onCreate}
          createLabel={t('nav.create')}
          account={getAccountLabel(profile)}
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
        {...conversationSlot}
        tabBar={
          <BottomTabBar
            active={destination}
            labels={labels}
            navLabel={t('nav.mainNavigation')}
            onTab={navigate}
          />
        }
        fab={
          pathname === '/' && !todayFabHidden && !conversationOpen ? (
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
