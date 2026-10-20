import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DestinationShell } from '@/components/shell/destination-shell'
import { ShellScrollerProvider } from '@/components/shell/shell-scroller-context'
import { useHabitCreateNavigationGuard } from '@/hooks/use-habit-create-navigation-guard'
import { useUIStore } from '@/stores/ui-store'

const navigation = vi.hoisted(() => ({ pathname: '/', width: 600, push: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useParams: () => ({}),
  useRouter: () => ({ push: navigation.push }),
}))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => navigation.width >= 1024 }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: undefined }) }))
vi.mock('@/hooks/use-keyboard-shortcuts', () => ({ useKeyboardShortcuts: () => {} }))
vi.mock('@/components/command/command-palette', () => ({ CommandPalette: () => null }))
vi.mock('@/components/navigation/notification-bell', () => ({ NotificationBell: () => null }))

const destinations = [
  { label: 'nav.today', href: '/' },
  { label: 'nav.calendar', href: '/calendar' },
  { label: 'nav.progress', href: '/progress' },
  { label: 'nav.profile', href: '/profile' },
]
const modifiedClicks = [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }]

function destinationLinks() {
  const selector = navigation.width >= 1024 ? '[data-shell-sidebar] nav' : '[data-shell-tab-bar] nav'
  return within(document.querySelector<HTMLElement>(selector)!)
}

function DraftGuard({ onNavigate }: Readonly<{ onNavigate: (action: () => void) => void }>) {
  useHabitCreateNavigationGuard({ active: true, dirty: true, leaving: false, onNavigate, onReturn: () => {} })
  return <input aria-label="Draft" defaultValue="Written draft" />
}

beforeEach(() => {
  vi.clearAllMocks()
  navigation.pathname = '/'
  navigation.width = 600
  useUIStore.setState({ astraConversationOpen: false })
  history.replaceState(null, '', '/')
})
afterEach(() => history.replaceState(null, '', '/'))

it.each([600, 1100, 1352])('renders routed links in the real shell at %ipx', async (width) => {
  navigation.width = width
  navigation.pathname = '/calendar'
  render(<DestinationShell onCreate={() => {}}><h1>Calendar</h1></DestinationShell>)
  const links = destinationLinks().getAllByRole('link')
  expect(links.map((link) => link.getAttribute('href'))).toEqual(destinations.map(({ href }) => href))
  expect(links.filter((link) => link.hasAttribute('aria-current'))).toEqual([links[1]])
  if (width >= 1024) expect(screen.getByRole('button', { name: 'chat.title' })).not.toHaveAttribute('href')
  await userEvent.click(links[2]!)
  expect(navigation.push).toHaveBeenCalledExactlyOnceWith('/progress')
})

it.each([1100, 1352])('holds destination changes until the draft guard approves at %ipx', async (width) => {
  navigation.width = width
  navigation.pathname = '/habits/new'
  history.replaceState(null, '', '/habits/new')
  const onNavigate = vi.fn<(action: () => void) => void>()
  render(<DestinationShell onCreate={() => {}}><DraftGuard onNavigate={onNavigate} /></DestinationShell>)
  const calendar = destinationLinks().getByRole('link', { name: 'nav.calendar' })
  expect(calendar).toHaveAttribute('href', '/calendar')
  expect(fireEvent.click(calendar)).toBe(false)
  expect(onNavigate).toHaveBeenCalledOnce()
  expect(navigation.push).not.toHaveBeenCalled()
  expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('Written draft')
  act(() => onNavigate.mock.calls[0]![0]())
  expect(onNavigate).toHaveBeenCalledOnce()
  expect(navigation.push).toHaveBeenCalledExactlyOnceWith('/calendar')
})

it.each([600, 1100, 1352])('leaves modified and middle clicks to the browser at %ipx', (width) => {
  navigation.width = width
  const onNavigate = vi.fn()
  render(<DestinationShell onCreate={() => {}}><DraftGuard onNavigate={onNavigate} /></DestinationShell>)
  useUIStore.setState({ astraConversationOpen: true })
  for (const { label, href } of destinations) {
    const link = destinationLinks().getByRole('link', { name: label })
    expect(link).toHaveAttribute('href', href)
    for (const modifiers of modifiedClicks) expect(fireEvent.click(link, modifiers)).toBe(true)
    expect(fireEvent(link, new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }))).toBe(true)
  }
  expect(onNavigate).not.toHaveBeenCalled()
  expect(navigation.push).not.toHaveBeenCalled()
  expect(useUIStore.getState().astraConversationOpen).toBe(true)
  expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('Written draft')
})

it.each([600, 1100, 1352])('reselects with Enter through the owning scroller at %ipx', async (width) => {
  navigation.width = width
  render(<ShellScrollerProvider><DestinationShell onCreate={() => {}}><h1>Today</h1></DestinationShell></ShellScrollerProvider>)
  const scroller = document.querySelector<HTMLElement>('[data-shell-scroller]')!
  const scrollTo = vi.fn()
  scroller.scrollTo = scrollTo
  destinationLinks().getByRole('link', { name: 'nav.today' }).focus()
  await userEvent.keyboard('{Enter}')
  expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0, behavior: 'instant' })
  expect(navigation.push).not.toHaveBeenCalled()
})
