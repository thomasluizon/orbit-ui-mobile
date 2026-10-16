import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DestinationShell } from '@/components/shell/destination-shell'
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
    localStorage.clear()
    useShellStore.setState(useShellStore.getInitialState())
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
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

  it('disables the toggle before client hydration', () => {
    const container = document.createElement('div')
    container.innerHTML = renderToString(shell())
    expect(within(container).getByRole('button', { name: 'shell.collapseSidebar' })).toBeDisabled()
  })
})
