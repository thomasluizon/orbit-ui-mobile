import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { profileKeys } from '@orbit/shared/query'
import { TodayDateControl } from '@/app/(app)/today-shell'
import { CalendarOptions } from '@/app/(app)/calendar/_components/calendar-options'
import { useUIStore } from '@/stores/ui-store'
import { DestinationShell } from '@/components/shell/destination-shell'
import { RootNotificationHeader } from '@/components/navigation/root-notification-header'
import { seedRenderedAccount } from '@/stores/auth-store'
import { setCurrentTheme } from '@/stores/theme-store'
import { updateThemePreference } from '@/lib/actions/profile'
import { useShellStore } from '@/stores/shell-store'

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
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
  useUIStore.setState({ orbitConversationOpen: false })
  setCurrentTheme('dark')
  useShellStore.setState(useShellStore.getInitialState())
})

it.each(['expanded sidebar', 'collapsed sidebar', 'compact progress header', 'compact profile header', 'compact today header', 'compact calendar header'])('flips theme, target icon and action name from the %s', (placement) => {
  const wide = !placement.startsWith('compact')
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: wide, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  if (placement === 'collapsed sidebar') useShellStore.setState({ sidebarCollapsed: true })
  const client = new QueryClient()
  client.setQueryData(profileKeys.detail(), createMockProfile({ themePreference: 'dark' }))
  const view = render(<QueryClientProvider client={client}>{wide ? <DestinationShell onCreate={vi.fn()}><h1>Today</h1></DestinationShell> : placement === 'compact today header' ? <TodayDateControl {...todayProps} /> : placement === 'compact calendar header' ? <CalendarOptions /> : <RootNotificationHeader />}</QueryClientProvider>)
  const owner = view.container.querySelector<HTMLElement>(wide ? '[data-shell-sidebar]' : '[data-header-appearance-actions]')!
  const button = within(owner).getByRole('button', { name: 'settings.theme.switchToLight' })
  const bell = within(owner).getByRole('button', { name: 'notifications.bell' })
  const [first, second] = placement === 'expanded sidebar' ? [bell, button] : [button, bell]
  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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

it('draws the inline bell with a stroke from the set and the stroke of the theme icon beside it', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  const view = render(<QueryClientProvider client={new QueryClient()}><RootNotificationHeader /></QueryClientProvider>)
  const owner = view.container.querySelector<HTMLElement>('[data-header-appearance-actions]')!
  const bell = owner.querySelector('.tabler-icon-bell')!
  const theme = owner.querySelector('.tabler-icon-sun')!
  expect([1.5, 2, 2.5]).toContain(Number(bell.getAttribute('stroke-width')))
  expect(bell.getAttribute('stroke-width')).toBe(theme.getAttribute('stroke-width'))
})

const noop = () => {}
const todayProps = {
  dayName: 'Wednesday', numericDate: '8 Apr', isTodaySelected: true, nextDisabled: false,
  previousLabel: 'Previous', nextLabel: 'Next', goToTodayLabel: 'Today', moreLabel: 'Options', searchLabel: 'Search', selectLabel: 'Select',
  collapseLabel: 'Collapse', allCollapsed: false, refreshLabel: 'Refresh', completedLabel: 'Completed',
  showCompleted: false, isFetching: false, onGoToPreviousDay: noop, onGoToNextDay: noop,
  onGoToToday: noop, onSearch: noop, onToggleSelect: noop, onToggleCollapse: noop,
  onRefresh: noop, onToggleCompleted: noop,
}

it('keeps the Orbit conversation open when changing appearance from the sidebar', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  useUIStore.setState({ orbitConversationOpen: true })
  const client = new QueryClient()
  render(<QueryClientProvider client={client}><DestinationShell onCreate={vi.fn()} conversationOpen conversationLabel="Orbit" conversation={<textarea aria-label="Orbit draft" defaultValue="Keep this draft" />}><h1>Today</h1></DestinationShell></QueryClientProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'settings.theme.switchToLight' }))
  expect(useUIStore.getState().orbitConversationOpen).toBe(true)
  expect(screen.getByRole('textbox', { name: 'Orbit draft' })).toHaveValue('Keep this draft')
})
