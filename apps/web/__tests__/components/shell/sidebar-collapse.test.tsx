import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OfflineRefusal } from '@/components/ui/offline-refusal'
import { DestinationShell } from '@/components/shell/destination-shell'
import { useUIStore } from '@/stores/ui-store'
import { useShellStore } from '@/stores/shell-store'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/', useParams: () => ({}), useRouter: () => ({ push: vi.fn() }),
}))
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
    useUIStore.setState({ astraConversationOpen: false })
    localStorage.clear()
    useShellStore.setState(useShellStore.getInitialState())
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  })

  it('keeps the toggle in the brand row beside the bell and first in the collapsed rail', () => {
    const { container } = render(shell())
    const sidebar = container.querySelector<HTMLElement>('[data-shell-sidebar]')!
    const brand = sidebar.querySelector('[data-shell-brand-row]')
    const toggle = screen.getByRole('button', { name: 'shell.collapseSidebar' })
    const bell = screen.getByRole('button', { name: 'notifications.bell' })
    expect(brand).toContainElement(toggle)
    expect(brand).toContainElement(bell)
    expect(toggle).toHaveAttribute('title', 'shell.collapseSidebar')
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toBe(sidebar.querySelector('nav'))
    expect(within(sidebar).getAllByRole('button').slice(0, 2)).toEqual([bell, toggle])
    toggle.focus()
    fireEvent.click(toggle)
    expect(within(sidebar).getAllByRole('button').slice(0, 2)).toEqual([toggle, bell])
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

  it('keeps all sidebar actions reachable when collapsed and restores the saved preference after remount', async () => {
    const onCreate = vi.fn()
    const view = render(shell(onCreate))
    fireEvent.click(screen.getByRole('button', { name: 'shell.collapseSidebar' }))
    const sidebar = within(view.container.querySelector<HTMLElement>('[data-shell-sidebar]')!)
    expect(sidebar.getAllByRole('link').map(link => link.getAttribute('href'))).toEqual(['/', '/calendar', '/progress', '/profile', '/profile'])
    fireEvent.click(sidebar.getByRole('button', { name: 'nav.createHabit' }))
    expect(onCreate).toHaveBeenCalledOnce()
    fireEvent.click(sidebar.getByRole('button', { name: 'nav.search' }))
    expect(useShellStore.getState().paletteOpen).toBe(true)
    expect(sidebar.getByRole('button', { name: 'chat.title' })).toBeEnabled()
    expect(sidebar.getByRole('button', { name: 'notifications.bell' })).toBeEnabled()
    expect(sidebar.getByRole('link', { name: 'Person, person@example.test' })).toBeVisible()
    const savedPreference = localStorage.getItem('orbit-shell-store')
    view.unmount()
    useShellStore.setState(useShellStore.getInitialState())
    localStorage.setItem('orbit-shell-store', savedPreference!)
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

  it('keeps an open Astra conversation and its draft while toggling', () => {
    function ConversationShell() {
      const open = useUIStore(state => state.astraConversationOpen)
      return <DestinationShell onCreate={vi.fn()} conversationOpen={open} conversationLabel="Astra"
        conversation={<textarea aria-label="Astra draft" defaultValue="Keep this draft" />}><h1>Today</h1></DestinationShell>
    }
    render(<ConversationShell />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.title' }))
    fireEvent.click(screen.getByRole('button', { name: 'shell.collapseSidebar' }))
    expect(screen.getByRole('dialog', { name: 'Astra' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Astra draft' })).toHaveValue('Keep this draft')
    fireEvent.click(screen.getByRole('button', { name: 'shell.expandSidebar' }))
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
  })

  it('hydrates a saved collapsed preference without replacing the server content', async () => {
    useShellStore.getState().toggleSidebar()
    const content = shell()
    const container = document.createElement('div')
    container.innerHTML = renderToString(content)
    document.body.append(container)
    const heading = within(container).getByRole('heading', { name: 'Today' })
    expect(within(container).getByRole('button', { name: 'shell.collapseSidebar' })).toBeDisabled()
    const onRecoverableError = vi.fn()
    let root: ReturnType<typeof hydrateRoot> | undefined
    try {
      await act(async () => { root = hydrateRoot(container, content, { onRecoverableError }) })
      expect(within(container).getByRole('button', { name: 'shell.expandSidebar' })).toBeEnabled()
      expect(within(container).getByRole('heading', { name: 'Today' })).toBe(heading)
      expect(onRecoverableError).not.toHaveBeenCalled()
    } finally {
      await act(async () => root?.unmount())
      container.remove()
    }
  })

  it('disables the toggle before client hydration', () => {
    const container = document.createElement('div')
    container.innerHTML = renderToString(shell())
    expect(within(container).getByRole('button', { name: 'shell.collapseSidebar' })).toBeDisabled()
  })
})
