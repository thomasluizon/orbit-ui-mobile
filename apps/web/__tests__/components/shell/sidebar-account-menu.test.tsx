import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ShellWide } from '@/components/shell/shell-wide'
import { useShellStore } from '@/stores/shell-store'
import { useAuthStore } from '@/stores/auth-store'
import { ASTRA_GLYPH_PATHS } from '@orbit/shared/contracts/brand'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

const locale = vi.hoisted(() => ({ portuguese: false }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key === 'profile.settingsRows.signOut'
  ? (locale.portuguese ? ptBR : en).profile.settingsRows.signOut : key }))

const props = {
  astraRow: { label: 'Astra', onOpen: vi.fn() },
  items: [{ id: 'perfil', href: '/profile', icon: 'perfil', label: 'Perfil' }],
  activeId: 'perfil', navLabel: 'Navigation',
  account: 'A person with a longer account name',
  accountEmail: 'a.person.with.a.long.email.address@example.com',
}
const accountLabel = `${props.account}, ${props.accountEmail}`

beforeEach(() => {
  locale.portuguese = false
  useShellStore.persist.clearStorage()
  useShellStore.setState({ sidebarCollapsed: false })
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: /min-width/.test(query), media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })))
})
afterEach(() => vi.unstubAllGlobals())

it.each([false, true])('opens the account menu by pointer, Enter and Space with collapsed=%s', async (collapsed) => {
  useShellStore.setState({ sidebarCollapsed: collapsed })
  const user = userEvent.setup()
  render(<ShellWide {...props} />)
  const trigger = screen.getByRole('button', { name: accountLabel })
  expect(trigger).not.toHaveAttribute('href')
  expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
  expect(screen.getAllByRole('link', { name: 'Perfil' })).toHaveLength(1)

  for (const input of ['pointer', '{Enter}', ' ']) {
    if (input === 'pointer') await user.click(trigger)
    else { act(() => trigger.focus()); await user.keyboard(input) }
    const menu = await screen.findByRole('menu', { name: accountLabel })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(menu.id).toBe(trigger.getAttribute('aria-controls'))
    expect(within(menu).getByLabelText(props.account)).toBeVisible()
    expect(within(menu).getByText(props.accountEmail)).toBeVisible()
    expect(within(menu).queryByRole('link')).not.toBeInTheDocument()
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(1)
    await waitFor(() => expect(within(menu).getByRole('menuitem', { name: en.profile.settingsRows.signOut })).toHaveFocus())
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  }
})

it('dismisses on an outside press and returns focus to the card', async () => {
  render(<ShellWide {...props} />)
  const trigger = screen.getByRole('button', { name: accountLabel })
  await userEvent.click(trigger)
  await screen.findByRole('menu')
  await userEvent.click(screen.getByRole('link', { name: 'Perfil' }))
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  expect(trigger).toHaveFocus()
})

it.each([false, true])('signs out through the existing account command with portuguese=%s', async (portuguese) => {
  locale.portuguese = portuguese
  const logout = vi.fn().mockResolvedValue(undefined)
  const originalLogout = useAuthStore.getState().logout
  useAuthStore.setState({ logout })
  try {
    render(<ShellWide {...props} />)
    expect(logout).not.toHaveBeenCalled()
    fireEvent.pointerDown(screen.getByRole('button', { name: accountLabel }), { button: 0, ctrlKey: false })
    const menu = await screen.findByRole('menu')
    fireEvent.click(within(menu).getByRole('menuitem', { name: (portuguese ? ptBR : en).profile.settingsRows.signOut }))
    expect(logout).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  } finally { useAuthStore.setState({ logout: originalLogout }) }
})

it.each([false, true].flatMap(collapsed => ['dark', 'light'].flatMap(theme => [false, true].map(open => ({ collapsed, theme, open })))))
  ('renders only the Astra mark with collapsed=$collapsed, theme=$theme and open=$open', ({ collapsed, theme, open }) => {
    document.documentElement.classList.toggle('light', theme === 'light')
    useShellStore.setState({ sidebarCollapsed: collapsed })
    try {
      render(<ShellWide {...props} conversationOpen={open} conversationLabel="Conversation" conversation={<button type="button">Close</button>} />)
      const row = screen.getByRole('button', { name: 'Astra' })
      expect(row.querySelectorAll('svg')).toHaveLength(1)
      const glyph = row.querySelector('svg')!
      expect(glyph).toHaveAttribute('data-asset', 'astra-mark')
      expect(glyph).toHaveAttribute('width', '20')
      expect(glyph).toHaveAttribute('height', '20')
      expect(glyph).toHaveAttribute('color', open ? 'var(--primary)' : 'var(--fg-3)')
      expect(Array.from(glyph.querySelectorAll('path'), path => path.getAttribute('d'))).toEqual(ASTRA_GLYPH_PATHS.map(path => path.d))
    } finally { document.documentElement.classList.remove('light') }
  })
