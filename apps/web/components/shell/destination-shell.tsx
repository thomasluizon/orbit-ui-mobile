'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ShellWideItem } from '@orbit/shared/contracts/shell'
import { ShellNoticeSlotProvider, useShellNoticeHost } from '@/hooks/use-shell-notice-slot'
import { DESTINATION_ICONS, SHELL_DESTINATION_IDS, resolveShellDestination, resolveShellChrome } from '@orbit/shared/utils'
import { Plus } from '@/components/ui/icons'
import { DestinationIcon, getDestinationIcon } from '@/components/navigation/destination-icon'
import { requestHabitCreateNavigation } from '@/hooks/use-habit-create-navigation-guard'
import { CommandPalette, type CommandNavigationItem } from '@/components/command/command-palette'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'
import { Fab } from '@/components/ui/fab'
import { useIsWideDesktop } from '@/hooks/use-is-desktop'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { useProfile } from '@/hooks/use-profile'
import { useShellStore } from '@/stores/shell-store'
import { useUIStore } from '@/stores/ui-store'
import {
  resetRouteTransitionIntent,
} from '@/lib/motion/route-intent'
import { ShellWide } from './shell-wide'
import { useServerApplePlatform } from './keyboard-platform-provider'

interface DestinationShellProps {
  children: ReactNode
  notice?: ReactNode
  composer?: ReactNode
  conversation?: ReactNode
  conversationOpen?: boolean
  conversationLabel?: string
  onCreate: () => void
  createRefusal?: ReactNode
}

type ComposerRenderer = () => ReactNode

interface ShellComposerSlotContextValue {
  register: (renderer: ComposerRenderer) => () => void
}

const ShellComposerSlotContext = createContext<ShellComposerSlotContextValue | null>(null)
const ShellHeaderSlotContext = createContext<ShellComposerSlotContextValue | null>(null)
function useShellComposerHost() {
  const [renderer, setRenderer] = useState<ComposerRenderer | null>(null)
  const register = useCallback((nextRenderer: ComposerRenderer) => {
    setRenderer(() => nextRenderer)
    return () => setRenderer((current) => current === nextRenderer ? null : current)
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

export function useShellHeaderSlot(renderer: ComposerRenderer, refreshKey: string) {
  const host = useContext(ShellHeaderSlotContext)
  useEffect(() => host?.register(renderer), [host, refreshKey, renderer])
  return host !== null
}

type BottomTab = 'hoje' | 'calendario' | 'progresso' | 'perfil'

const ROUTES: Record<BottomTab, string> = {
  hoje: '/',
  calendario: '/calendar',
  progresso: '/progress',
  perfil: '/profile',
}

function hasPrimaryNavigation(pathname: string): boolean {
  return pathname !== '/wrapped'
}

function getAccountLabel(profile: { name: string; email: string } | null | undefined) {
  if (!profile) return undefined
  return profile.name.trim() || profile.email.split('@').at(0)?.trim() || undefined
}

function subscribeToPlatform() {
  return () => {}
}

function getApplePlatform() {
  const platform = (navigator as Navigator & { userAgentData?: { platform: string } })
    .userAgentData?.platform || navigator.platform
  return /Mac|iPhone|iPad|iPod|iOS/i.test(platform)
}

function usePaletteHint() {
  const serverApplePlatform = useServerApplePlatform()
  const applePlatform = useSyncExternalStore(
    subscribeToPlatform,
    getApplePlatform,
    () => serverApplePlatform,
  )
  return applePlatform ? '⌘K' : 'Ctrl K'
}

export function DestinationShell({
  children,
  notice,
  composer,
  conversation,
  conversationOpen,
  conversationLabel,
  onCreate,
  createRefusal,
}: Readonly<DestinationShellProps>) {
  const registeredComposer = useShellComposerHost()
  const registeredHeader = useShellComposerHost()
  const registeredNotice = useShellNoticeHost()
  const hostedNotice = registeredNotice.content === undefined
    ? notice
    : <>{notice}{registeredNotice.content}</>

  return (
    <ShellNoticeSlotProvider value={registeredNotice.value}>
      <ShellComposerSlotContext.Provider value={registeredComposer.value}>
        <ShellHeaderSlotContext.Provider value={registeredHeader.value}>
          <DestinationShellContent
            header={registeredHeader.content}
            notice={hostedNotice}
            composer={registeredComposer.content ?? composer}
            conversation={conversation}
            conversationOpen={conversationOpen}
            conversationLabel={conversationLabel}
            onCreate={onCreate}
            createRefusal={createRefusal}
          >
            {children}
          </DestinationShellContent>
        </ShellHeaderSlotContext.Provider>
      </ShellComposerSlotContext.Provider>
    </ShellNoticeSlotProvider>
  )
}

function DestinationShellContent({
  children,
  header,
  notice,
  composer,
  conversation,
  conversationOpen,
  conversationLabel,
  onCreate,
  createRefusal,
}: Readonly<DestinationShellProps & { header?: ReactNode }>) {
  const t = useTranslations()
  const router = useRouter()
  const pathname = usePathname()
  const params = useParams<{ missing?: string[] }>()
  const notFoundVisible = Array.isArray(params.missing)
  const previousPathname = useRef(pathname)
  const wide = useIsWideDesktop()
  const { profile } = useProfile()
  const setPaletteOpen = useShellStore((state) => state.setPaletteOpen)
  const lastDestination = useShellStore((state) => state.lastDestination)
  const setLastDestination = useShellStore((state) => state.setLastDestination)
  const todayFabHidden = useUIStore((state) => state.todayFabHidden)
  const paletteHint = usePaletteHint()
  const destination = resolveShellDestination(pathname)
  const chrome = resolveShellChrome(pathname, lastDestination)
  const activeId = notFoundVisible ? '' : chrome.activeId
  useEffect(() => {
    if (destination && !notFoundVisible && pathname !== '/upgrade') setLastDestination(destination)
  }, [destination, notFoundVisible, pathname, setLastDestination])
  useEffect(() => {
    if (previousPathname.current === pathname) return
    previousPathname.current = pathname
    const frame = requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>('[data-shell-header] h1, [data-shell-scroller] h1')
      const target = heading ?? document.querySelector<HTMLElement>('[data-shell-scroller]')
      if (target && !target.hasAttribute('tabindex')) target.tabIndex = -1
      target?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [pathname])
  const navigationEnabled = hasPrimaryNavigation(pathname) && (wide || !chrome.flow)
  const conversationSlot = conversation !== undefined && conversationLabel
    ? { conversation, conversationOpen, conversationLabel }
    : {}

  useKeyboardShortcuts(navigationEnabled)

  const labels = useMemo<Record<BottomTab, string>>(
    () => Object.fromEntries(SHELL_DESTINATION_IDS.map((id) => [id, t(DESTINATION_ICONS[id].labelKey)])) as Record<BottomTab, string>,
    [t],
  )

  const navigate = useCallback(
    (id: BottomTab) => {
      const route = ROUTES[id]
      if (route === pathname) {
        resetRouteTransitionIntent()
        return
      }
      requestHabitCreateNavigation(() => router.push(route))
    },
    [pathname, router],
  )

  const wideItems = useMemo<ShellWideItem[]>(
    () => SHELL_DESTINATION_IDS.map((id) => ({ id, label: labels[id], icon: id })),
    [labels],
  )

  const commandItems = useMemo<CommandNavigationItem[]>(
    () => SHELL_DESTINATION_IDS.map((id) => ({ id, label: labels[id], icon: getDestinationIcon(id), onSelect: () => navigate(id) })),
    [labels, navigate],
  )

  const palette = (
    <CommandPalette
      navItems={commandItems}
      onCreateHabit={onCreate}
    />
  )
  const wideCreate = pathname === '/upgrade' || pathname === '/habits/new'
    ? { onCreate: undefined, createLabel: undefined }
    : { onCreate, createLabel: t('nav.createHabit') }

  if (pathname === '/wrapped') {
    return children
  }

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
        activeId={activeId}
        navLabel={t('nav.mainNavigation')}
        onSelect={(id) => navigate(id as BottomTab)}
        {...wideCreate}
        createRefusal={createRefusal}
        account={getAccountLabel(profile)}
        notifications={wide ? <NotificationBell /> : undefined}
        onPalette={() => setPaletteOpen(true)}
        paletteLabel={t('nav.search')}
        paletteHint={paletteHint}
        notice={notice}
        header={header}
        composer={!notFoundVisible && chrome.composer ? composer : undefined}
        tabBar={
          !chrome.flow ? <BottomTabBar
            activeId={activeId}
            items={SHELL_DESTINATION_IDS.map((id) => ({ id, label: labels[id], icon: ({ active }) => <DestinationIcon destination={id} active={active} color={active ? 'var(--primary)' : 'var(--fg-3)'} /> }))}
            label={t('nav.mainNavigation')}
            onSelect={(id) => navigate(id as BottomTab)}
          /> : undefined
        }
        fab={
          pathname === '/' && !todayFabHidden && !conversationOpen ? (
            <div className="flex items-end gap-3">
              <div aria-live="polite" aria-atomic="true" className={createRefusal ? 'min-w-0 max-w-[min(68vw,280px)]' : ''}>{createRefusal}</div>
              <Fab label={t('nav.createHabit')} onClick={onCreate}>
                <Plus size={24} strokeWidth={2} aria-hidden="true" />
              </Fab>
            </div>
          ) : undefined
        }
      >
        <div id="orbit-main">{children}</div>
      </ShellWide>
      {!chrome.flow || wide ? palette : null}
    </>
  )
}
