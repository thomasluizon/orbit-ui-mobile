import { createContext, useContext, useState, type ReactNode } from 'react'
import { act } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { notificationKeys } from '@orbit/shared/query'
import { createMockNotification } from '@orbit/shared/__tests__/factories'

const mocks = vi.hoisted(() => ({
  pathname: '/',
  params: {} as { missing?: string[] },
  wide: false,
  push: vi.fn(),
  setPaletteOpen: vi.fn(),
  setShowCreateModal: vi.fn(),
  keyboardEnabled: vi.fn(),
  profileName: '',
  profileLoaded: true,
  lastDestination: 'hoje',
  setLastDestination: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useParams: () => mocks.params,
  useRouter: () => ({ push: mocks.push }),
}))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => () => mocks.push('/profile') }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => mocks.wide, useIsDesktop: () => mocks.wide }))
vi.mock('@/hooks/use-keyboard-shortcuts', () => ({
  useKeyboardShortcuts: (enabled: boolean) => mocks.keyboardEnabled(enabled),
}))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.profileLoaded ? { name: mocks.profileName, email: 'person@example.com' } : undefined }),
}))
vi.mock('@/stores/shell-store', () => ({
  useShellStore: (selector: (state: { setPaletteOpen: typeof mocks.setPaletteOpen; lastDestination: string; setLastDestination: typeof mocks.setLastDestination }) => unknown) =>
    selector({ setPaletteOpen: mocks.setPaletteOpen, lastDestination: mocks.lastDestination, setLastDestination: mocks.setLastDestination }),
}))
vi.mock('@/stores/ui-store', () => ({
  useUIStore: (
    selector: (state: {
      setShowCreateModal: typeof mocks.setShowCreateModal
    }) => unknown,
  ) => selector({
    setShowCreateModal: mocks.setShowCreateModal,
  }),
}))
vi.mock('@/components/command/command-palette', () => ({
  CommandPalette: () => <div data-testid="command-palette" />,
}))
vi.mock('@/components/ui/fab', () => ({
  Fab: ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button type="button" aria-label={label} onClick={onClick} />
  ),
}))
vi.mock('@/components/shell/shell-wide', () => ({
  ShellWide: ({ children, header, items, activeId, onSelect, onCreate, createLabel, createRefusal, notice, composer, account, paletteHint, onPalette, paletteLabel, tabBar, fab }: {
    children: ReactNode
    header?: ReactNode
    items?: ReadonlyArray<{ id: string; label: string }>
    activeId?: string | null
    onSelect?: (id: string) => void
    onCreate?: () => void
    createLabel?: string
    createRefusal?: ReactNode
    notice?: ReactNode
    composer?: ReactNode
    account?: string
    paletteHint?: string
    onPalette?: () => void
    paletteLabel?: string
    tabBar?: ReactNode
    fab?: ReactNode
  }) => (
    <div data-testid={mocks.wide ? 'wide-shell' : 'compact-shell'}>
      {header ? <div data-shell-header="">{header}</div> : null}
      <main data-shell-scroller="">{children}</main>{notice ? <div data-shell-notice="">{notice}</div> : null}
      {mocks.wide && (account ? <span data-testid="wide-account">{account}</span> : <span data-shell-account="" data-loading="true" />)}
      {mocks.wide && onPalette ? <button type="button" onClick={onPalette}>{paletteLabel}</button> : null}
      {mocks.wide && paletteHint ? <kbd>{paletteHint}</kbd> : null}
      {composer ? <div data-shell-pinned-slot="">{composer}</div> : null}
      {mocks.wide ? items?.map((item) => (
        <button type="button" key={item.id} aria-current={item.id === activeId ? 'page' : undefined} onClick={() => onSelect?.(item.id)}>{item.label}</button>
      )) : tabBar}
      {mocks.wide && onCreate ? <button type="button" onClick={onCreate}>{createLabel}</button> : null}
      {mocks.wide ? createRefusal : null}
      {!mocks.wide ? fab : null}
    </div>
  ),
}))

import {
  DestinationShell,
  useShellComposerSlot,
  useShellHeaderSlot,
} from '@/components/shell/destination-shell'
import { useShellNoticeSlot } from '@/hooks/use-shell-notice-slot'
import { PageHeader } from '@/components/ui/page-header'
import { RouteTransitionShell } from '@/components/motion/route-transition-shell'
import { NotificationInbox } from '@/components/navigation/notification-inbox'
import { AppBar } from '@/components/ui/app-bar'
import { SelectionTray } from '@/components/habits/selection-tray'
import { TodayOverlays } from '@/app/(app)/today-page-view'
import NotFound from '@/app/not-found'
import type { TodayView } from '@/app/(app)/use-today-page'
import {
  getCurrentRouteTransitionIntent,
  getRouteScenarioForIntent,
  resetRouteTransitionIntent,
  setRouteTransitionIntent,
} from '@/lib/motion/route-intent'

describe('DestinationShell', () => {
  const originalUserAgentData = Object.getOwnPropertyDescriptor(navigator, 'userAgentData')
  const originalPlatform = Object.getOwnPropertyDescriptor(navigator, 'platform')

  beforeEach(() => {
    mocks.pathname = '/'
    mocks.params = {}
    mocks.wide = false
    mocks.profileName = ''
    mocks.profileLoaded = true
    mocks.lastDestination = 'hoje'
    mocks.setLastDestination.mockImplementation((destination: string) => { mocks.lastDestination = destination })
    resetRouteTransitionIntent()
    vi.clearAllMocks()
  })

  it.each([false, true])('shows an unselected not-found shell with its composer at wide=%s', (wide) => {
    mocks.pathname = '/nao-existe'
    mocks.params = { missing: ['nao-existe'] }
    mocks.wide = wide
    const view = render(
      <DestinationShell onCreate={() => {}} composer={<span>Composer</span>}>
        <NotFound />
      </DestinationShell>,
    )
    expect(screen.getByRole('heading', { name: 'notFoundPage.title' })).toBeInTheDocument()
    expect(view.container.querySelector('[data-shell-pinned-slot]')).toHaveTextContent('Composer')
    expect(view.container.querySelectorAll('[aria-current="page"]')).toHaveLength(0)
  })

  it.each([false, true])('includes the not-found composer and unselected navigation in server markup at wide=%s', (wide) => {
    mocks.pathname = '/nao-existe'
    mocks.params = { missing: ['nao-existe'] }
    mocks.wide = wide
    const html = renderToString(
      <DestinationShell onCreate={() => {}} composer={<span>Composer</span>}>
        <NotFound />
      </DestinationShell>,
    )

    expect(html).toContain('data-shell-pinned-slot=""')
    expect(html).toContain('Composer')
    expect(html).not.toContain('aria-current="page"')
  })

  afterEach(() => {
    if (originalUserAgentData) Object.defineProperty(navigator, 'userAgentData', originalUserAgentData)
    else Reflect.deleteProperty(navigator, 'userAgentData')
    if (originalPlatform) Object.defineProperty(navigator, 'platform', originalPlatform)
    else Reflect.deleteProperty(navigator, 'platform')
  })

  it.each([
    ['Mac', 'Win32', '⌘K'],
    ['Windows', 'Win32', 'Ctrl K'],
    ['Linux', 'Linux x86_64', 'Ctrl K'],
  ])('shows the palette shortcut for %s', (platform, fallback, hint) => {
    mocks.wide = true
    Object.defineProperty(navigator, 'userAgentData', {
      configurable: true,
      value: { platform },
    })
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      value: fallback,
    })

    render(<DestinationShell onCreate={() => {}}><h1>Today</h1></DestinationShell>)

    expect(screen.getByText(hint, { selector: 'kbd' })).toBeInTheDocument()
  })

  it('uses the fallback platform and hydrates the neutral hint before switching', async () => {
    mocks.wide = true
    Object.defineProperty(navigator, 'userAgentData', {
      configurable: true,
      value: undefined,
    })
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    })
    const shell = <DestinationShell onCreate={() => {}}><h1>Today</h1></DestinationShell>
    const serverHtml = renderToString(shell)
    expect(serverHtml).toContain('<kbd>Ctrl K</kbd>')
    const container = document.createElement('div')
    container.innerHTML = serverHtml
    const initialMarkup = container.innerHTML
    const recoverableError = vi.fn()
    let root: ReturnType<typeof hydrateRoot> | undefined

    await act(async () => {
      root = hydrateRoot(container, shell, { onRecoverableError: recoverableError })
    })

    expect(initialMarkup).toBe(serverHtml)
    expect(recoverableError).not.toHaveBeenCalled()
    expect(container.querySelector('kbd')).toHaveTextContent('⌘K')
    await act(async () => root?.unmount())
  })

  it('renders exactly four compact destinations and keeps the FAB on Hoje only', () => {
    const onCreate = vi.fn()
    render(<DestinationShell onCreate={onCreate}><h1>Today</h1></DestinationShell>)

    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'nav.today',
      'nav.calendar',
      'nav.progress',
      'nav.profile',
      'nav.createHabit',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'nav.progress' }))
    expect(mocks.push).toHaveBeenCalledWith('/progress')
    expect(screen.getByTestId('command-palette')).toBeInTheDocument()
    expect(mocks.keyboardEnabled).toHaveBeenCalledWith(true)
  })

  it('forwards the create refusal to the wide create control', () => {
    mocks.wide = true
    render(<DestinationShell onCreate={() => {}} createRefusal={<span>Offline create refusal</span>}><h1>Today</h1></DestinationShell>)
    expect(screen.getByText('Offline create refusal')).toBeInTheDocument()
  })

  it('forwards the create refusal beside the compact FAB', () => {
    render(<DestinationShell onCreate={() => {}} createRefusal={<span>Offline create refusal</span>}><h1>Today</h1></DestinationShell>)
    expect(screen.getByText('Offline create refusal')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'nav.createHabit' })).toBeInTheDocument()
  })

  it('passes the selection tray target through the destination composer slot', () => {
    render(
      <DestinationShell onCreate={() => {}} composer={<div data-testid="selection-composer" />}>
        <h1>Today</h1>
      </DestinationShell>,
    )

    expect(screen.getByTestId('selection-composer')).toBeInTheDocument()
  })

  it.each([false, true])('mounts destination feedback in the shell notice slot at wide=%s', async (wide) => {
    mocks.wide = wide

    function ProfileExportNotice() {
      const [done, setDone] = useState(false)
      useShellNoticeSlot(
        done,
        () => <div data-testid="export-done">Export done</div>,
        done ? 'export-done' : 'export-idle',
      )
      return <button type="button" onClick={() => setDone(true)}>Export</button>
    }

    render(
      <DestinationShell onCreate={() => {}} composer={<div>Composer</div>}>
        <ProfileExportNotice />
      </DestinationShell>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))

    const notice = await screen.findByTestId('export-done')
    expect(notice.parentElement).toHaveAttribute('data-shell-notice')
    expect(document.querySelector('[data-shell-pinned-slot]')).toHaveTextContent('Composer')
  })

  it.each([
    ['compact', false],
    ['wide', true],
  ])(
    'mounts the tray directly in the %s shell slot and removes it with Today',
    async (_layout, wide) => {
      mocks.wide = wide

      function TodaySelection() {
        const [active, setActive] = useState(false)
        useShellComposerSlot(
          active,
          () => (
            <SelectionTray
              selectedCount={1}
              allSelected={false}
              onSelectAll={() => {}}
              onDeselectAll={() => {}}
              onBulkLog={() => {}}
              onBulkSkip={() => {}}
              onBulkDelete={() => {}}
              onCancel={() => {}}
            />
          ),
          active ? 'selected:h-1' : 'empty',
        )
        return <button type="button" onClick={() => setActive(true)}>Select habit</button>
      }

      function App({ todayOwnsDestination }: Readonly<{ todayOwnsDestination: boolean }>) {
        return (
          <DestinationShell onCreate={() => {}}>
            {todayOwnsDestination ? <TodaySelection /> : <h1>Calendar</h1>}
          </DestinationShell>
        )
      }

      const { rerender } = render(<App todayOwnsDestination />)

      expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Select habit' }))

      const tray = await screen.findByTestId('bulk-action-bar')
      expect(tray.parentElement).toHaveAttribute('data-shell-pinned-slot')
      expect(tray.parentElement).not.toBe(document.body)

      rerender(<App todayOwnsDestination={false} />)

      await waitFor(() => {
        expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument()
      })
      expect(document.querySelector('[data-shell-pinned-slot]')).not.toBeInTheDocument()
    },
  )

  it('clears the tray while the exiting Today subtree remains mounted', async () => {
    const view = {
      isSelectMode: true,
      selectedHabitIds: new Set(['h-1']),
      selection: {
        allSelected: false,
        confirmBulkDelete: vi.fn(),
        confirmBulkLog: vi.fn(),
        confirmBulkSkip: vi.fn(),
        deselectAll: vi.fn(),
        selectAll: vi.fn(),
        setShowBulkDeleteConfirm: vi.fn(),
        showBulkDeleteConfirm: false,
      },
      toggleSelectMode: vi.fn(),
    } as unknown as TodayView

    function App() {
      return (
        <DestinationShell onCreate={() => {}}>
          <div data-testid="retained-today">
            <TodayOverlays view={view} />
          </div>
          {mocks.pathname === '/calendar' ? <h1>Calendar</h1> : <h1>Today</h1>}
        </DestinationShell>
      )
    }

    const { rerender } = render(<App />)

    expect(await screen.findByTestId('bulk-action-bar')).toBeInTheDocument()

    mocks.pathname = '/calendar'
    rerender(<App />)

    expect(screen.getByTestId('retained-today')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument()
    })
  })

  it('removes the compact FAB away from Hoje', () => {
    mocks.pathname = '/calendar'
    render(<DestinationShell onCreate={() => {}}><h1>Calendar</h1></DestinationShell>)

    expect(screen.queryByRole('button', { name: 'nav.createHabit' })).not.toBeInTheDocument()
  })

  it('keeps a later pushed flow after selecting the active destination', () => {
    setRouteTransitionIntent('tab')
    render(<DestinationShell onCreate={() => {}}><h1>Today</h1></DestinationShell>)

    fireEvent.click(screen.getByRole('button', { name: 'nav.today' }))
    mocks.push('/habits/h1')

    expect(mocks.push).toHaveBeenCalledOnce()
    expect(mocks.push).toHaveBeenCalledWith('/habits/h1')
    expect(
      getRouteScenarioForIntent(getCurrentRouteTransitionIntent()),
    ).toBe('route-push')
  })

  it('renders the same four destinations in the wide shell', () => {
    mocks.wide = true
    const onCreate = vi.fn()
    render(<DestinationShell onCreate={onCreate}><h1>Today</h1></DestinationShell>)

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'nav.search',
      'nav.today',
      'nav.calendar',
      'nav.progress',
      'nav.profile',
      'nav.createHabit',
    ])
    expect(screen.getByRole('button', { name: 'nav.search' })).not.toHaveTextContent('command.title')
    fireEvent.click(screen.getByRole('button', { name: 'nav.search' }))
    expect(mocks.setPaletteOpen).toHaveBeenCalledWith(true)
    fireEvent.click(screen.getByRole('button', { name: 'nav.createHabit' }))
    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it('passes the profile name and falls back to the email local part', () => {
    mocks.wide = true
    mocks.profileName = 'Ada Lovelace'
    const page = render(<DestinationShell onCreate={() => {}}><h1>Today</h1></DestinationShell>)

    expect(screen.getByTestId('wide-account')).toHaveTextContent('Ada Lovelace')
    expect(screen.getByTestId('wide-account')).not.toHaveTextContent('@')

    mocks.profileName = ''
    page.rerender(<DestinationShell onCreate={() => {}}><h1>Today</h1></DestinationShell>)
    expect(screen.getByTestId('wide-account')).toHaveTextContent('person')
    expect(screen.getByTestId('wide-account')).not.toHaveTextContent('example.com')
  })

  it('uses the flow shell without primary navigation on upgrade', () => {
    mocks.pathname = '/upgrade'
    render(<DestinationShell onCreate={() => {}}><h1>Upgrade</h1></DestinationShell>)

    expect(screen.getByTestId('compact-shell')).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getAllByRole('heading')).toHaveLength(1)
    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument()
    expect(mocks.keyboardEnabled).toHaveBeenCalledWith(false)
  })

  it('lets Wrapped replace the destination shell', () => {
    mocks.pathname = '/wrapped'
    mocks.wide = true
    render(
      <DestinationShell onCreate={() => {}} notice={<div role="status">Reload</div>}>
        <h1>Wrapped</h1>
      </DestinationShell>,
    )

    expect(screen.getByRole('heading', { name: 'Wrapped' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByTestId('wide-shell')).not.toBeInTheDocument()
    expect(screen.queryByTestId('compact-shell')).not.toBeInTheDocument()
    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument()
    expect(mocks.keyboardEnabled).toHaveBeenCalledWith(false)
  })

  it.each([
    '/profile/security',
    '/account/billing',
  ])('selects Profile for its secondary route %s', (pathname) => {
    mocks.pathname = pathname
    render(<DestinationShell onCreate={() => {}}><h1>Profile flow</h1></DestinationShell>)

    expect(screen.getByRole('button', { name: 'nav.profile' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it.each([false, true])('keeps navigation and hides the composer for alerts at wide=%s', (wide) => {
    mocks.pathname = '/notifications'
    mocks.wide = wide
    render(<DestinationShell onCreate={() => {}} composer={<div data-testid="composer" />}><h1>Alerts</h1></DestinationShell>)
    expect(screen.queryByTestId('composer')).toBeNull()
    expect(screen.getByRole('button', { name: 'nav.today' })).toBeInTheDocument()
    if (!wide) expect(screen.getByRole('button', { name: 'nav.today' })).toHaveAttribute('aria-current', 'page')
  })

  it.each(['/streak', '/retrospective', '/unknown'])(
    'keeps a current destination for the removed or unknown route %s',
    (pathname) => {
      mocks.pathname = pathname
      render(<DestinationShell onCreate={() => {}}><h1>Unknown</h1></DestinationShell>)

      expect(screen.getAllByRole('button').filter((button) => button.hasAttribute('aria-current')))
        .toHaveLength(1)
    },
  )

  it.each([
    '/',
    '/about',
    '/calendar-sync',
    '/calendar',
    '/chat',
    '/onboarding',
    '/profile',
    '/progress',
    '/retrospective',
    '/streak',
    '/support',
    '/upgrade',
    '/wrapped',
  ])('never adds a second page heading at %s', (pathname) => {
    mocks.pathname = pathname

    render(<DestinationShell onCreate={() => {}}><h1>Page title</h1></DestinationShell>)

    expect(screen.getAllByRole('heading')).toHaveLength(1)
  })

  it('focuses the object heading after navigating to a detail route', async () => {
    function Detail() {
      useShellHeaderSlot(() => <AppBar title="Habit" titleIsHeading={false} />, 'habit-1')
      return <h1 tabIndex={-1}>Read</h1>
    }
    const view = render(<DestinationShell onCreate={() => {}}><h1>Today</h1></DestinationShell>)
    mocks.pathname = '/habits/h1'
    view.rerender(<DestinationShell onCreate={() => {}}><Detail /></DestinationShell>)
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Read' })).toHaveFocus())
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByText('Habit').closest('[data-shell-header]')).toBeInTheDocument()
  })

  it.each([false, true])('pins pushed headers outside the scroller at wide=%s', async (wide) => {
    mocks.pathname = '/about'
    mocks.wide = wide
    render(<DestinationShell onCreate={() => {}}>
      <PageHeader title="About" backLabel="Back" onBack={() => {}} />
      <p>Content</p>
    </DestinationShell>)
    const heading = await screen.findByRole('heading', { name: 'About' })
    expect(heading.closest('[data-shell-header]')).toBeInTheDocument()
    expect(heading.closest('[data-shell-scroller]')).toBeNull()
    expect(screen.getAllByRole('heading')).toHaveLength(1)
  })

  it.each([false, true])('keeps the incoming header after the outgoing route exits at wide=%s', async (wide) => {
    mocks.pathname = '/profile'
    mocks.wide = wide
    function App() {
      return <DestinationShell onCreate={() => {}}>
        <RouteTransitionShell>
          {mocks.pathname === '/profile'
            ? <h1>Profile</h1>
            : <PageHeader title="Support" backLabel="Back to Profile" onBack={() => mocks.push('/profile')} />}
        </RouteTransitionShell>
      </DestinationShell>
    }
    const view = render(<App />)
    mocks.pathname = '/support'
    view.rerender(<App />)
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Profile' })).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { level: 1, name: 'Support' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to Profile' }))
    expect(mocks.push).toHaveBeenCalledWith('/profile')
  })

  it.each([false, true])('renders one live route during a push and return at wide=%s', (wide) => {
    const RouteContext = createContext('/profile')
    function LiveRoute() {
      const path = useContext(RouteContext)
      return path === '/profile'
        ? <div data-testid="profile-settings-groups"><button type="button">Setting</button></div>
        : <><PageHeader title="Support" backLabel="Back to Profile" onBack={() => {}} /><p>Support content</p></>
    }
    function App() {
      return <RouteContext.Provider value={mocks.pathname}>
        <DestinationShell onCreate={() => {}}><RouteTransitionShell><LiveRoute /></RouteTransitionShell></DestinationShell>
      </RouteContext.Provider>
    }
    mocks.wide = wide
    mocks.pathname = '/profile'
    const view = render(<App />)
    mocks.pathname = '/support'
    act(() => { setRouteTransitionIntent('forward'); view.rerender(<App />) })
    expect.soft(screen.getAllByText('Support content')).toHaveLength(1)
    mocks.pathname = '/profile'
    act(() => { setRouteTransitionIntent('back'); view.rerender(<App />) })
    expect(screen.getAllByTestId('profile-settings-groups')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Setting' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Back to Profile' })).not.toBeInTheDocument()
  })

  it.each([false, true])('keeps a neutral pushed inbox header after live route cleanup at wide=%s', async (wide) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    queryClient.setQueryData(notificationKeys.lists(), { items: [], unreadCount: 0 })
    const RouteContext = createContext('/profile')
    function LiveRoute() {
      const path = useContext(RouteContext)
      return path === '/profile'
        ? <h1>Profile</h1>
        : <NotificationInbox />
    }
    function App() {
      return <RouteContext.Provider value={mocks.pathname}>
        <DestinationShell onCreate={() => {}}><RouteTransitionShell><LiveRoute /></RouteTransitionShell></DestinationShell>
      </RouteContext.Provider>
    }
    mocks.wide = wide
    mocks.pathname = '/profile'
    const view = render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>)
    mocks.pathname = '/notifications'
    view.rerender(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>)
    expect.soft(screen.getAllByRole('list', { name: 'notifications.title' })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'notifications.title' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'notifications.markAllRead' })).not.toBeInTheDocument()
    await act(async () => {
      queryClient.setQueryData(notificationKeys.lists(), { items: [createMockNotification({ isRead: false })], unreadCount: 1 })
      await new Promise((resolve) => setTimeout(resolve, 300))
    })
    expect(screen.getByRole('heading', { level: 1, name: 'notifications.title' }).closest('[data-shell-header]')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'notifications.markAllRead' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'common.back' }))
    expect(mocks.push).toHaveBeenCalledWith('/profile')
    mocks.pathname = '/profile'
    view.rerender(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>)
    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'notifications.title' })).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'notifications.title' })).not.toBeInTheDocument()
    view.unmount()
    queryClient.clear()
  })

  it.each([false, true])('does not let a retained route clear the incoming header at wide=%s', (wide) => {
    mocks.pathname = '/profile'
    mocks.wide = wide
    const onBack = vi.fn()
    const incoming = <PageHeader key="incoming" title="Support" backLabel="Back to Profile" onBack={onBack} />
    function App({ retainingPrevious, showIncoming = true }: { retainingPrevious: boolean; showIncoming?: boolean }) {
      return <DestinationShell onCreate={() => {}}>
        {retainingPrevious ? <PageHeader key="previous" title="Support" backLabel="Previous back" onBack={() => {}} /> : null}
        {showIncoming ? incoming : <h1>Profile</h1>}
      </DestinationShell>
    }
    const view = render(<App retainingPrevious />)
    expect(screen.getByRole('button', { name: 'Back to Profile' })).toBeInTheDocument()
    mocks.pathname = '/support'
    view.rerender(<App retainingPrevious={false} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Support' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to Profile' }))
    expect(onBack).toHaveBeenCalledOnce()
    mocks.pathname = '/profile'
    view.rerender(<App retainingPrevious={false} showIncoming={false} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Support' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back to Profile' })).not.toBeInTheDocument()
  })

  it('replaces a hosted header when its renderer changes under the same key', () => {
    function HeaderSlot({ title }: { title: string }) {
      useShellHeaderSlot(() => <h1>{title}</h1>, 'same-route')
      return null
    }
    const view = render(<DestinationShell onCreate={() => {}}><HeaderSlot title="Loading" /></DestinationShell>)
    expect(screen.getByRole('heading', { level: 1, name: 'Loading' })).toBeInTheDocument()

    view.rerender(<DestinationShell onCreate={() => {}}><HeaderSlot title="Ready" /></DestinationShell>)
    expect(screen.getByRole('heading', { level: 1, name: 'Ready' })).toBeInTheDocument()
  })

  it('updates a pushed page header action while its title stays the same', () => {
    const view = render(<DestinationShell onCreate={() => {}}>
      <PageHeader title="Inbox" backLabel="Back" onBack={() => {}} action={<span>One unread</span>} />
    </DestinationShell>)
    expect(screen.getByText('One unread').closest('[data-shell-header]')).toBeInTheDocument()

    view.rerender(<DestinationShell onCreate={() => {}}>
      <PageHeader title="Inbox" backLabel="Back" onBack={() => {}} action={<span>Two unread</span>} />
    </DestinationShell>)
    expect(screen.getByText('Two unread').closest('[data-shell-header]')).toBeInTheDocument()
    expect(screen.queryByText('One unread')).not.toBeInTheDocument()
  })

  it.each([false, true])('shows composer only on roots and habit detail at wide=%s', (wide) => {
    mocks.wide = wide
    for (const pathname of ['/', '/calendar', '/progress', '/profile', '/habits/h1', '/about', '/support', '/search', '/ai-settings', '/preferences', '/advanced']) {
      mocks.pathname = pathname
      const view = render(<DestinationShell onCreate={() => {}} composer={<span>Composer</span>}><h1>Title</h1></DestinationShell>)
      expect(Boolean(view.container.querySelector('[data-shell-pinned-slot]'))).toBe(
        ['/', '/calendar', '/progress', '/profile', '/habits/h1'].includes(pathname),
      )
      view.unmount()
    }
  })

  it.each([false, true])('retains Calendar on Search at wide=%s', (wide) => {
    mocks.wide = wide
    mocks.pathname = '/calendar'
    const view = render(<DestinationShell onCreate={() => {}}><h1>Calendar</h1></DestinationShell>)
    mocks.pathname = '/search'
    view.rerender(<DestinationShell onCreate={() => {}}><h1>Search</h1></DestinationShell>)
    expect(screen.getByRole('button', { name: 'nav.calendar' })).toHaveAttribute('aria-current', 'page')
    view.unmount()
    mocks.lastDestination = 'hoje'
    render(<DestinationShell onCreate={() => {}}><h1>Search</h1></DestinationShell>)
    expect(screen.getByRole('button', { name: 'nav.today' })).toHaveAttribute('aria-current', 'page')
  })

  it('keeps the wide upgrade sidebar and reserves its account row', () => {
    mocks.wide = true
    mocks.pathname = '/upgrade'
    mocks.profileLoaded = false
    const view = render(<DestinationShell onCreate={() => {}} composer={<span>Composer</span>}><h1>Upgrade</h1></DestinationShell>)
    expect(view.container.querySelectorAll('button[aria-current], button[aria-label^="nav."]')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'nav.profile' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'nav.search' })).toBeInTheDocument()
    expect(view.container.querySelector('[data-shell-account]')).toHaveAttribute('data-loading', 'true')
    expect(view.container.querySelector('[data-shell-pinned-slot]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'wide-create' })).toBeNull()
    expect(mocks.keyboardEnabled).toHaveBeenCalledWith(true)
    mocks.profileLoaded = true
    mocks.profileName = 'Ada'
    view.rerender(<DestinationShell onCreate={() => {}}><h1>Upgrade</h1></DestinationShell>)
    expect(screen.getByTestId('wide-account')).toHaveTextContent('Ada')
  })
})
