vi.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => ({ currentTheme: 'dark', toggleTheme: vi.fn() }) }))
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@/components/shell/destination-shell'
import { SIDEBAR_COLLAPSED_COOKIE } from '@/lib/sidebar-preference'

const route = vi.hoisted(() => ({ pathname: '/wrapped' }))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname, useParams: () => ({}), useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { name: 'Person', email: 'person@example.test' } }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('@/hooks/use-keyboard-shortcuts', () => ({ useKeyboardShortcuts: () => {} }))
vi.mock('@/components/command/command-palette', () => ({ CommandPalette: () => null }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

async function coldLoadWithSavedPreference() {
  document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=1; path=/`
  vi.resetModules()
  const { useShellStore } = await import('@/stores/shell-store')
  expect(useShellStore.getState().sidebarCollapsed).toBe(true)
  return { useShellStore }
}

describe('cold shell entry with a saved sidebar preference', () => {
  beforeEach(() => {
    vi.resetModules()
    document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=; path=/; max-age=0`
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  })

  it('draws the saved collapsed sidebar on the first client frame of a cold load', async () => {
    await coldLoadWithSavedPreference()
    const { DestinationShell } = await import('@/components/shell/destination-shell')
    route.pathname = '/'
    const view = render(<DestinationShell onCreate={vi.fn()}><h1>Today</h1></DestinationShell>)
    expect(view.container.querySelector('[data-shell-sidebar]')).toHaveAttribute('data-collapsed', 'true')
  })

  it.each(['/wrapped', '/progress'])('retains the preference through %s and back to Today', async (pathname) => {
    const { useShellStore } = await coldLoadWithSavedPreference()
    const { DestinationShell } = await import('@/components/shell/destination-shell')
    route.pathname = pathname
    const view = render(<DestinationShell onCreate={vi.fn()}><h1>Entry</h1></DestinationShell>)
    expect(useShellStore.getState().lastDestination).toBe('progresso')
    if (pathname === '/wrapped') expect(view.container.querySelector('[data-shell-sidebar]')).toBeNull()

    route.pathname = '/'
    view.rerender(<DestinationShell onCreate={vi.fn()}><h1>Today</h1></DestinationShell>)
    expect(await screen.findByRole('button', { name: 'shell.expandSidebar' })).toBeEnabled()
    expect(useShellStore.getState().lastDestination).toBe('hoje')
    fireEvent.click(screen.getByRole('button', { name: 'shell.expandSidebar' }))
    expect(useShellStore.getState().sidebarCollapsed).toBe(false)
    expect(screen.getByRole('button', { name: 'shell.collapseSidebar' })).toBeEnabled()
  })

  it.each(['setLastDestination', 'setPaletteOpen', 'togglePalette', 'toggleSidebar'] as const)(
    'keeps the saved preference when %s changes state', async (action) => {
      const { useShellStore } = await coldLoadWithSavedPreference()
      const state = useShellStore.getState()
      if (action === 'setLastDestination') state.setLastDestination('perfil')
      else if (action === 'setPaletteOpen') state.setPaletteOpen(true)
      else state[action]()
      expect(useShellStore.getState().sidebarCollapsed).toBe(action !== 'toggleSidebar')
      if (action === 'setLastDestination') expect(useShellStore.getState().lastDestination).toBe('perfil')
      if (action === 'setPaletteOpen' || action === 'togglePalette') expect(useShellStore.getState().paletteOpen).toBe(true)
    },
  )
})
