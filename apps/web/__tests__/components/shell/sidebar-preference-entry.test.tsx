import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  const { useShellStore: producer } = await import('@/stores/shell-store')
  await producer.persist.rehydrate()
  producer.getState().toggleSidebar()
  const savedPreference = localStorage.getItem('orbit-shell-store')!
  expect(producer.getState().sidebarCollapsed).toBe(true)
  vi.resetModules()
  const { useShellStore } = await import('@/stores/shell-store')
  expect(useShellStore.getState().sidebarCollapsed).toBe(false)
  expect(useShellStore.persist.hasHydrated()).toBe(false)
  return { useShellStore, savedPreference }
}

describe('cold shell entry with a saved sidebar preference', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  })

  it.each(['/wrapped', '/progress'])('retains the preference through %s and back to Today', async (pathname) => {
    const { useShellStore, savedPreference } = await coldLoadWithSavedPreference()
    const { DestinationShell } = await import('@/components/shell/destination-shell')
    route.pathname = pathname
    const view = render(<DestinationShell onCreate={vi.fn()}><h1>Entry</h1></DestinationShell>)
    expect(useShellStore.getState().lastDestination).toBe('progresso')
    if (pathname === '/wrapped') expect(view.container.querySelector('[data-shell-sidebar]')).toBeNull()
    expect(localStorage.getItem('orbit-shell-store')).toBe(savedPreference)

    route.pathname = '/'
    view.rerender(<DestinationShell onCreate={vi.fn()}><h1>Today</h1></DestinationShell>)
    expect(await screen.findByRole('button', { name: 'shell.expandSidebar' })).toBeEnabled()
    expect(useShellStore.getState().lastDestination).toBe('hoje')
    expect(localStorage.getItem('orbit-shell-store')).toBe(savedPreference)
    fireEvent.click(screen.getByRole('button', { name: 'shell.expandSidebar' }))
    expect(useShellStore.getState().sidebarCollapsed).toBe(false)
    expect(screen.getByRole('button', { name: 'shell.collapseSidebar' })).toBeEnabled()
  })

  it.each(['setLastDestination', 'setPaletteOpen', 'togglePalette', 'toggleSidebar'] as const)(
    'hydrates the preference before %s changes state', async (action) => {
      const { useShellStore, savedPreference } = await coldLoadWithSavedPreference()
      const state = useShellStore.getState()
      if (action === 'setLastDestination') state.setLastDestination('perfil')
      else if (action === 'setPaletteOpen') state.setPaletteOpen(true)
      else state[action]()
      expect(useShellStore.persist.hasHydrated()).toBe(true)
      expect(useShellStore.getState().sidebarCollapsed).toBe(action !== 'toggleSidebar')
      if (action !== 'toggleSidebar') expect(localStorage.getItem('orbit-shell-store')).toBe(savedPreference)
      if (action === 'setLastDestination') expect(useShellStore.getState().lastDestination).toBe('perfil')
      if (action === 'setPaletteOpen' || action === 'togglePalette') expect(useShellStore.getState().paletteOpen).toBe(true)
    },
  )
})
