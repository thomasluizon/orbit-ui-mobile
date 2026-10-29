import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { profileKeys } from '@orbit/shared/query'
import { DestinationShell } from '@/components/shell/destination-shell'
import { RootNotificationHeader } from '@/components/navigation/root-notification-header'
import { seedRenderedAccount } from '@/stores/auth-store'
import { setCurrentTheme } from '@/stores/theme-store'
import { updateThemePreference } from '@/lib/actions/profile'
import { useShellStore } from '@/stores/shell-store'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({ usePathname: () => '/', useParams: () => ({}), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: createMockProfile() }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('@/hooks/use-keyboard-shortcuts', () => ({ useKeyboardShortcuts: () => {} }))
vi.mock('@/components/command/command-palette', () => ({ CommandPalette: () => null }))
vi.mock('@/lib/actions/profile', () => ({ updateThemePreference: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showPersistentError: vi.fn() }) }))

beforeEach(() => {
  vi.clearAllMocks()
  seedRenderedAccount('theme-action-account')
  setCurrentTheme('dark')
  useShellStore.setState(useShellStore.getInitialState())
})

it.each(['expanded sidebar', 'collapsed sidebar', 'compact header'])('flips theme, target icon and action name from the %s', (placement) => {
  const wide = placement !== 'compact header'
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: wide, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  if (placement === 'collapsed sidebar') useShellStore.setState({ sidebarCollapsed: true })
  const client = new QueryClient()
  client.setQueryData(profileKeys.detail(), createMockProfile({ themePreference: 'dark' }))
  const view = render(<QueryClientProvider client={client}>{wide ? <DestinationShell onCreate={vi.fn()}><h1>Today</h1></DestinationShell> : <RootNotificationHeader />}</QueryClientProvider>)
  const owner = view.container.querySelector<HTMLElement>(wide ? '[data-shell-sidebar]' : '[data-root-notification-header]')!
  const button = within(owner).getByRole('button', { name: 'settings.theme.switchToLight' })
  const bell = within(owner).getByRole('button', { name: 'notifications.bell' })
  expect(button.compareDocumentPosition(bell) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(button.querySelector('.tabler-icon-sun')).not.toBeNull()
  expect(button).toHaveAttribute('title', 'settings.theme.switchToLight')
  fireEvent.click(button)
  expect(screen.getByRole('button', { name: 'settings.theme.switchToDark' })).toBe(button)
  expect(button.querySelector('.tabler-icon-moon')).not.toBeNull()
  expect(client.getQueryData(profileKeys.detail())).toMatchObject({ themePreference: 'light' })
  expect(updateThemePreference).toHaveBeenLastCalledWith({ themePreference: 'light' }, 'theme-action-account')
  expect(document.documentElement).toHaveClass('light')
  fireEvent.click(button)
  expect(button).toHaveAccessibleName('settings.theme.switchToLight')
  expect(button.querySelector('.tabler-icon-sun')).not.toBeNull()
  expect(client.getQueryData(profileKeys.detail())).toMatchObject({ themePreference: 'dark' })
})
