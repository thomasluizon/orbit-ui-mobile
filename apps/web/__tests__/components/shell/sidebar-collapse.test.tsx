import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OfflineRefusal } from '@/components/ui/offline-refusal'
import { DestinationShell } from '@/components/shell/destination-shell'
import { useUIStore } from '@/stores/ui-store'
import { useShellStore } from '@/stores/shell-store'
import { SidebarPreferenceProvider } from '@/components/shell/sidebar-preference-provider'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/', useParams: () => ({}), useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => ({ currentTheme: 'dark', toggleTheme: vi.fn() }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { name: 'Person', email: 'person@example.test' } }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('@/hooks/use-keyboard-shortcuts', () => ({ useKeyboardShortcuts: () => {} }))
vi.mock('@/components/command/command-palette', () => ({ CommandPalette: () => null }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

function shell(onCreate = vi.fn()) {
  return <DestinationShell onCreate={onCreate}><h1>Today</h1><input aria-label="Draft" defaultValue="Keep this draft" /></DestinationShell>
}

describe('sidebar collapse', () => {
  beforeEach(() => {
    useUIStore.setState({ orbitConversationOpen: false })
    useShellStore.setState({ sidebarCollapsed: false })
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  })

  it('puts the bell on the brand row and the theme action before the toggle in both sidebar states', () => {
    const { container } = render(shell())
    const sidebar = container.querySelector<HTMLElement>('[data-shell-sidebar]')!
    const brand = sidebar.querySelector('[data-shell-brand-row]')
    const toggle = screen.getByRole('button', { name: 'shell.collapseSidebar' })
    const bell = screen.getByRole('button', { name: 'notifications.bell' })
    expect(brand).toContainElement(toggle)
    expect(brand).toContainElement(bell)
    expect(toggle).toHaveAttribute('title', 'shell.collapseSidebar')
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toBe(sidebar.querySelector('nav'))
    const theme = screen.getByRole('button', { name: 'settings.theme.switchToLight' })
    expect(within(sidebar).getAllByRole('button').slice(0, 3)).toEqual([bell, theme, toggle])
    toggle.focus()
    fireEvent.click(toggle)
    expect(within(sidebar).getAllByRole('button').slice(0, 3)).toEqual([theme, toggle, screen.getByRole('button', { name: 'notifications.bell' })])
    expect(toggle).toHaveFocus()
    expect(toggle).toHaveAttribute('title', 'shell.expandSidebar')
    expect(sidebar.querySelector('[data-shell-account]')).toHaveAttribute('title', 'Person, person@example.test')
    const navigation = sidebar.querySelector('nav')!
    const create = within(sidebar).getByRole('button', { name: 'nav.createHabit' })
    const controls = [...sidebar.querySelectorAll('button, a[href]')]
    expect(controls.slice(controls.indexOf(navigation.lastElementChild as HTMLElement) + 1)).toEqual([
      create, sidebar.querySelector('[data-shell-account]'),
    ])
  })

  it('collapses and expands with Enter and Space while preserving the destination and draft', async () => {
    const user = userEvent.setup()
    const { container } = render(shell())
    const toggle = screen.getByRole('button', { name: 'shell.collapseSidebar' })
    toggle.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'shell.expandSidebar' })).toBe(toggle)
    expect(toggle).toHaveFocus()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(container.querySelector('[data-shell-sidebar]')).toHaveAttribute('data-collapsed', 'true')
    expect(within(container.querySelector<HTMLElement>('[data-shell-sidebar]')!).getByRole('link', { name: 'nav.today' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('Keep this draft')
    await user.keyboard(' ')
    expect(toggle).toHaveAccessibleName('shell.collapseSidebar')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('keeps all sidebar actions reachable when collapsed and keeps the preference after remount', async () => {
    const onCreate = vi.fn()
    const view = render(shell(onCreate))
    fireEvent.click(screen.getByRole('button', { name: 'shell.collapseSidebar' }))
    const sidebar = within(view.container.querySelector<HTMLElement>('[data-shell-sidebar]')!)
    expect(sidebar.getAllByRole('link').map(link => link.getAttribute('href'))).toEqual(['/', '/calendar', '/progress', '/profile'])
    fireEvent.click(sidebar.getByRole('button', { name: 'nav.createHabit' }))
    expect(onCreate).toHaveBeenCalledOnce()
    fireEvent.click(sidebar.getByRole('button', { name: 'nav.search' }))
    expect(useShellStore.getState().paletteOpen).toBe(true)
    expect(sidebar.getByRole('button', { name: 'shell.orbitButton.open' })).toBeEnabled()
    expect(sidebar.getByRole('button', { name: 'notifications.bell' })).toBeEnabled()
    expect(sidebar.getByRole('button', { name: 'Person, person@example.test' })).toBeVisible()
    view.unmount()
    render(shell())
    expect(await screen.findByRole('button', { name: 'shell.expandSidebar' })).toBeEnabled()
  })

  it('keeps an offline create refusal in the content notice when the rail is collapsed', () => {
    const view = render(<DestinationShell onCreate={vi.fn()} createRefusal={<OfflineRefusal icon="create" title="Connect to create" reason="Reconnect and try again" />}><h1>Today</h1></DestinationShell>)
    fireEvent.click(screen.getByRole('button', { name: 'shell.collapseSidebar' }))
    expect(view.container.querySelector('[data-shell-sidebar]')).not.toHaveTextContent('Reconnect and try again')
    expect(view.container.querySelector('[data-shell-create-refusal]')).toHaveTextContent('Reconnect and try again')
  })

  it('mounts the empty refusal announcement before the message arrives', () => {
    const view = render(<DestinationShell onCreate={vi.fn()}><h1>Today</h1></DestinationShell>)
    fireEvent.click(screen.getByRole('button', { name: 'shell.collapseSidebar' }))
    const announcement = view.container.querySelector('[data-shell-create-refusal]')
    expect(announcement).toHaveAttribute('aria-live', 'polite')
    expect(announcement).toBeEmptyDOMElement()
    view.rerender(<DestinationShell onCreate={vi.fn()} createRefusal={<OfflineRefusal icon="create" title="Connect to create" reason="Reconnect and try again" />}><h1>Today</h1></DestinationShell>)
    expect(view.container.querySelector('[data-shell-create-refusal]')).toBe(announcement)
    expect(announcement).toHaveTextContent('Reconnect and try again')
  })

  it('keeps an open Orbit conversation and its draft while toggling', () => {
    function ConversationShell() {
      const open = useUIStore(state => state.orbitConversationOpen)
      return <DestinationShell onCreate={vi.fn()} conversationOpen={open} conversationLabel="Orbit"
        conversation={<textarea aria-label="Orbit draft" defaultValue="Keep this draft" />}><h1>Today</h1></DestinationShell>
    }
    render(<ConversationShell />)
    fireEvent.click(screen.getByRole('button', { name: 'shell.orbitButton.open' }))
    fireEvent.click(screen.getByRole('button', { name: 'shell.collapseSidebar' }))
    expect(screen.getByRole('dialog', { name: 'Orbit' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Orbit draft' })).toHaveValue('Keep this draft')
    fireEvent.click(screen.getByRole('button', { name: 'shell.expandSidebar' }))
    expect(useUIStore.getState().orbitConversationOpen).toBe(true)
  })

  it('hydrates a saved collapsed preference without replacing the server content', async () => {
    useShellStore.setState({ sidebarCollapsed: true })
    const content = <SidebarPreferenceProvider initialCollapsed>{shell()}</SidebarPreferenceProvider>
    const container = document.createElement('div')
    container.innerHTML = renderToString(content)
    document.body.append(container)
    const heading = within(container).getByRole('heading', { name: 'Today' })
    const serverSidebar = container.querySelector('[data-shell-sidebar]')
    const onRecoverableError = vi.fn()
    let root: ReturnType<typeof hydrateRoot> | undefined
    try {
      await act(async () => { root = hydrateRoot(container, content, { onRecoverableError }) })
      expect(within(container).getByRole('button', { name: 'shell.expandSidebar' })).toBeEnabled()
      expect(within(container).getByRole('heading', { name: 'Today' })).toBe(heading)
      expect(container.querySelector('[data-shell-sidebar]')).toBe(serverSidebar)
      expect(onRecoverableError).not.toHaveBeenCalled()
    } finally {
      await act(async () => root?.unmount())
      container.remove()
    }
  })

  it('draws the saved collapsed sidebar in the server HTML, before any script runs', () => {
    const container = document.createElement('div')
    container.innerHTML = renderToString(<SidebarPreferenceProvider initialCollapsed>{shell()}</SidebarPreferenceProvider>)
    const sidebar = container.querySelector<HTMLElement>('[data-shell-sidebar]')!
    expect(sidebar).toHaveAttribute('data-collapsed', 'true')
    expect(sidebar).toHaveClass('w-[96px]')
    expect(within(sidebar).getByRole('button', { name: 'nav.createHabit' })).toBeTruthy()
    expect(within(container).getByRole('button', { name: 'shell.expandSidebar' })).toBeDisabled()
  })

  it('draws the expanded sidebar in the server HTML when no preference is saved', () => {
    const container = document.createElement('div')
    container.innerHTML = renderToString(shell())
    expect(container.querySelector('[data-shell-sidebar]')).not.toHaveAttribute('data-collapsed')
  })

  it('draws the saved collapsed sidebar on the first client frame, with no swap after an effect', () => {
    useShellStore.setState({ sidebarCollapsed: true })
    const { container } = render(shell())
    expect(container.querySelector('[data-shell-sidebar]')).toHaveAttribute('data-collapsed', 'true')
    expect(screen.getByRole('button', { name: 'shell.expandSidebar' })).toBeInTheDocument()
  })

  it('disables the toggle before client hydration', () => {
    const container = document.createElement('div')
    container.innerHTML = renderToString(shell())
    expect(within(container).getByRole('button', { name: 'shell.collapseSidebar' })).toBeDisabled()
  })
})
