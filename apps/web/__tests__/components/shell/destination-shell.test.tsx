import { useState, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  pathname: '/',
  wide: false,
  push: vi.fn(),
  setPaletteOpen: vi.fn(),
  setShowCreateModal: vi.fn(),
}))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => mocks.wide }))
vi.mock('@/hooks/use-keyboard-shortcuts', () => ({ useKeyboardShortcuts: () => {} }))
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
vi.mock('@/components/command/command-palette', () => ({ CommandPalette: () => null }))
vi.mock('@/components/ui/fab', () => ({
  Fab: ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button type="button" aria-label={label} onClick={onClick} />
  ),
}))
vi.mock('@/components/shell/shell-412', () => ({
  Shell412: ({ children, tabBar, fab, notice, composer }: {
    children: ReactNode
    tabBar?: ReactNode
    fab?: ReactNode
    notice?: ReactNode
    composer?: ReactNode
  }) => (
    <div data-testid="compact-shell">
      {children}{notice}
      {composer ? <div data-shell-pinned-slot="">{composer}</div> : null}
      {tabBar}{fab}
    </div>
  ),
}))
vi.mock('@/components/shell/shell-wide', () => ({
  ShellWide: ({ children, items, onSelect, onCreate, notice, composer }: {
    children: ReactNode
    items?: ReadonlyArray<{ id: string; label: string }>
    onSelect?: (id: string) => void
    onCreate?: () => void
    notice?: ReactNode
    composer?: ReactNode
  }) => (
    <div data-testid="wide-shell">
      {children}{notice}
      {composer ? <div data-shell-pinned-slot="">{composer}</div> : null}
      {items?.map((item) => (
        <button type="button" key={item.id} onClick={() => onSelect?.(item.id)}>{item.label}</button>
      ))}
      {onCreate ? <button type="button" aria-label="wide-create" onClick={onCreate} /> : null}
    </div>
  ),
}))

import {
  DestinationShell,
  useShellComposerSlot,
} from '@/components/shell/destination-shell'
import { SelectionTray } from '@/components/habits/selection-tray'

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
      'nav.today',
      'nav.calendar',
      'nav.progress',
      'nav.profile',
      'nav.create',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'nav.progress' }))
    expect(mocks.push).toHaveBeenCalledWith('/progress')
  })

  it('passes the selection tray target through the destination composer slot', () => {
    render(
      <DestinationShell onCreate={() => {}} composer={<div data-testid="selection-composer" />}>
        <h1>Today</h1>
      </DestinationShell>,
    )

    expect(screen.getByTestId('selection-composer')).toBeInTheDocument()
  })

  it('mounts the tray directly in the shell slot on the false-to-true transition', async () => {
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

    render(
      <DestinationShell onCreate={() => {}}>
        <TodaySelection />
      </DestinationShell>,
    )

    expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Select habit' }))

    const tray = await screen.findByTestId('bulk-action-bar')
    expect(tray.parentElement).toHaveAttribute('data-shell-pinned-slot')
    expect(tray.parentElement).not.toBe(document.body)
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
