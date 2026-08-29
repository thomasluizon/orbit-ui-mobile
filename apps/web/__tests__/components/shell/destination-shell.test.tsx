import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  pathname: '/',
  wide: false,
  push: vi.fn(),
  setPaletteOpen: vi.fn(),
  setShowCreateModal: vi.fn(),
  keyboardEnabled: vi.fn(),
}))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => mocks.wide }))
vi.mock('@/hooks/use-keyboard-shortcuts', () => ({
  useKeyboardShortcuts: (enabled: boolean) => mocks.keyboardEnabled(enabled),
}))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { email: 'person@example.com' } }) }))
vi.mock('@/stores/shell-store', () => ({
  useShellStore: (selector: (state: { setPaletteOpen: typeof mocks.setPaletteOpen }) => unknown) =>
    selector({ setPaletteOpen: mocks.setPaletteOpen }),
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
vi.mock('@/components/shell/shell-composer', () => ({
  ShellComposer: ({ onOpenConversation }: { onOpenConversation: () => void }) => (
    <button type="button" aria-label="shell-open" onClick={onOpenConversation} />
  ),
}))
vi.mock('@/components/chat/chat-page-content', () => ({
  ChatPageContent: ({ onClose }: { onClose: () => void }) => (
    <button type="button" aria-label="conversation-close" onClick={onClose} />
  ),
}))
vi.mock('@/components/shell/shell-412', () => ({
  Shell412: ({ children, tabBar, fab, notice, composer, conversation, conversationOpen }: {
    children: ReactNode
    tabBar?: ReactNode
    fab?: ReactNode
    notice?: ReactNode
    composer?: ReactNode
    conversation?: ReactNode
    conversationOpen?: boolean
  }) => (
    <div data-testid="compact-shell">
      {children}{notice}{composer}{tabBar}{fab}{conversationOpen ? conversation : null}
    </div>
  ),
}))
vi.mock('@/components/shell/shell-wide', () => ({
  ShellWide: ({
    children,
    items,
    onSelect,
    onCreate,
    notice,
    composer,
    conversation,
    conversationOpen,
  }: {
    children: ReactNode
    items?: ReadonlyArray<{ id: string; label: string }>
    onSelect?: (id: string) => void
    onCreate?: () => void
    notice?: ReactNode
    composer?: ReactNode
    conversation?: ReactNode
    conversationOpen?: boolean
  }) => (
    <div data-testid="wide-shell">
      {children}{notice}{composer}{conversationOpen ? conversation : null}
      {items?.map((item) => (
        <button type="button" key={item.id} onClick={() => onSelect?.(item.id)}>{item.label}</button>
      ))}
      {onCreate ? <button type="button" aria-label="wide-create" onClick={onCreate} /> : null}
    </div>
  ),
}))

import { DestinationShell } from '@/components/shell/destination-shell'

describe('DestinationShell', () => {
  beforeEach(() => {
    mocks.pathname = '/'
    mocks.wide = false
    vi.clearAllMocks()
  })

  it('renders exactly four compact destinations and keeps the FAB on Hoje only', () => {
    const onCreate = vi.fn()
    render(<DestinationShell onCreate={onCreate}><h1>Today</h1></DestinationShell>)

    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'shell-open',
      'nav.today',
      'nav.calendar',
      'nav.progress',
      'nav.profile',
      'nav.create',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'nav.progress' }))
    expect(mocks.push).toHaveBeenCalledWith('/progress')
    expect(screen.getByTestId('command-palette')).toBeInTheDocument()
    expect(mocks.keyboardEnabled).toHaveBeenCalledWith(true)
  })

  it('removes the compact FAB away from Hoje', () => {
    mocks.pathname = '/calendar'
    render(<DestinationShell onCreate={() => {}}><h1>Calendar</h1></DestinationShell>)

    expect(screen.queryByRole('button', { name: 'nav.create' })).not.toBeInTheDocument()
  })

  it('renders the same four destinations in the wide shell', () => {
    mocks.wide = true
    const onCreate = vi.fn()
    render(<DestinationShell onCreate={onCreate}><h1>Today</h1></DestinationShell>)

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      '',
      'nav.today',
      'nav.calendar',
      'nav.progress',
      'nav.profile',
      '',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'wide-create' }))
    expect(onCreate).toHaveBeenCalledTimes(1)
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

  it.each(['/', '/calendar', '/progress', '/profile'])('mounts the composer at %s', (pathname) => {
    mocks.pathname = pathname
    render(<DestinationShell onCreate={() => {}}><h1>Destination</h1></DestinationShell>)

    expect(screen.getByRole('button', { name: 'shell-open' })).toBeInTheDocument()
  })

  it('does not mount the composer on a pushed screen', () => {
    mocks.pathname = '/preferences'
    render(<DestinationShell onCreate={() => {}}><h1>Preferences</h1></DestinationShell>)

    expect(screen.queryByRole('button', { name: 'shell-open' })).not.toBeInTheDocument()
  })

  it('opens and closes the shell conversation from the Astra trigger', () => {
    render(<DestinationShell onCreate={() => {}}><h1>Today</h1></DestinationShell>)

    fireEvent.click(screen.getByRole('button', { name: 'shell-open' }))
    fireEvent.click(screen.getByRole('button', { name: 'conversation-close' }))

    expect(screen.queryByRole('button', { name: 'conversation-close' })).not.toBeInTheDocument()
  })

  it('keeps the composer mounted when a notice is present', () => {
    render(
      <DestinationShell onCreate={() => {}} notice={<div>Notice sentinel</div>}>
        <h1>Today</h1>
      </DestinationShell>,
    )

    expect(screen.getByText('Notice sentinel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'shell-open' })).toBeInTheDocument()
  })

  it.each([
    '/achievements',
    '/preferences',
    '/advanced',
    '/profile/security',
    '/notifications/123',
    '/account/billing',
  ])('selects Profile for its secondary route %s', (pathname) => {
    mocks.pathname = pathname
    render(<DestinationShell onCreate={() => {}}><h1>Profile flow</h1></DestinationShell>)

    expect(screen.getByRole('button', { name: 'nav.profile' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('selects no destination for a route outside the shared table', () => {
    mocks.pathname = '/unknown'
    render(<DestinationShell onCreate={() => {}}><h1>Unknown</h1></DestinationShell>)

    expect(screen.getAllByRole('button').filter((button) => button.hasAttribute('aria-current')))
      .toHaveLength(0)
  })

  it.each([
    '/',
    '/about',
    '/achievements',
    '/advanced',
    '/ai-settings',
    '/calendar-sync',
    '/calendar',
    '/chat',
    '/onboarding',
    '/preferences',
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
})
