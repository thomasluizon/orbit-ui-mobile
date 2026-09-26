import { useLayoutEffect, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const media = vi.hoisted(() => ({ matches: false }))

vi.mock('@/components/ui/lockup', () => ({ Lockup: () => <div>Orbit</div> }))
vi.mock('@/components/ui/pill-button', () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
}))

import { ShellWide } from '@/components/shell/shell-wide'

const items = [
  { id: 'hoje', label: 'Hoje', icon: 'home' },
  { id: 'calendario', label: 'Calendário', icon: 'calendar' },
  { id: 'progresso', label: 'Progresso', icon: 'chart-line' },
  { id: 'perfil', label: 'Perfil', icon: 'user' },
]

function BlurFocusedElement() {
  useLayoutEffect(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }, [])
  return null
}

describe('ShellWide', () => {
  beforeEach(() => {
    media.matches = false
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: media.matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })))
  })

  it('owns the 232px navigation, 740px canvas, notice, and pinned composer', () => {
    const { container } = render(
      <ShellWide
        items={items}
        activeId="hoje"
        navLabel="Main navigation"
        notice={<div>Notice</div>}
        composer={<div>Composer</div>}
      >
        <h1>Today</h1>
      </ShellWide>,
    )

    expect(container.querySelector('[data-shell-sidebar]')).toHaveClass('w-[232px]')
    expect(container.querySelector('[data-shell-scroller]')?.parentElement).toHaveClass('max-w-[740px]')
    expect(container.querySelector('[data-shell-notice]')).toHaveTextContent('Notice')
    expect(container.querySelector('[data-shell-pinned-slot]')).toHaveTextContent('Composer')
    expect(screen.getAllByRole('heading')).toHaveLength(1)
  })

  it('selects sidebar destinations and exposes the active one', () => {
    const onSelect = vi.fn()
    render(
      <ShellWide
        items={items}
        activeId="calendario"
        navLabel="Main navigation"
        onSelect={onSelect}
      />,
    )

    const calendar = screen.getByRole('button', { name: 'Calendário' })
    expect(calendar).toHaveAttribute('aria-current', 'page')
    calendar.click()
    expect(onSelect).toHaveBeenCalledWith('calendario')
  })

  it.each(['dark', 'light'])('keeps navigation colors valid in %s mode', (mode) => {
    document.documentElement.dataset.theme = mode
    render(
      <ShellWide
        items={items}
        activeId="calendario"
        navLabel="Main navigation"
        onSelect={() => {}}
      />,
    )

    const active = screen.getByRole('button', { name: 'Calendário' })
    const inactive = screen.getByRole('button', { name: 'Hoje' })
    expect(active).toHaveClass('text-[var(--primary-soft)]')
    expect(active).toHaveClass('hover:text-[var(--primary-text)]')
    expect(active.querySelector('svg')).toHaveAttribute('stroke', 'var(--primary)')
    expect(inactive).toHaveClass('text-[var(--fg-3)]')
    expect(inactive.querySelector('svg')).toHaveAttribute('stroke', 'var(--fg-3)')
    delete document.documentElement.dataset.theme
  })

  it('renders the account name as a profile chip with an initial well', () => {
    render(
      <ShellWide
        items={items}
        activeId="hoje"
        navLabel="Main navigation"
        account="Ada Lovelace"
      />,
    )

    const account = screen.getByRole('link', { name: 'Ada Lovelace' })
    expect(account).toHaveAttribute('href', '/profile')
    expect(account).not.toHaveTextContent('@')
  })

  it('uses a modal conversation overlay below the side-panel breakpoint', () => {
    const { container } = render(
      <ShellWide
        items={items}
        activeId="hoje"
        navLabel="Main navigation"
        conversation={<div>Conversation</div>}
        conversationLabel="Astra conversation"
      >
        <h1>Today</h1>
      </ShellWide>,
    )

    expect(screen.getByRole('dialog', { name: 'Astra conversation' })).toHaveAttribute(
      'data-shell-conversation',
      'overlay',
    )
    expect(container.querySelector('[data-shell-background]')).toHaveAttribute('inert')
    expect(container.querySelector('[data-shell-background]')).toHaveAttribute('aria-hidden', 'true')
  })

  it('uses the 380px side panel at 1416px and above', () => {
    media.matches = true
    const { container } = render(
      <ShellWide
        items={items}
        activeId="hoje"
        navLabel="Main navigation"
        conversation={<div>Conversation</div>}
        conversationLabel="Astra conversation"
      >
        <h1>Today</h1>
      </ShellWide>,
    )

    expect(container.querySelector('[data-shell-conversation="panel"]')).toHaveClass('w-[380px]')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(container.querySelector('[data-shell-background]')).not.toHaveAttribute('inert')
  })

  it('moves focus into the Support conversation panel and returns it on close', () => {
    media.matches = true
    const props = {
      items,
      activeId: 'perfil',
      navLabel: 'Main navigation',
      conversation: <><BlurFocusedElement /><button type="button">Close conversation</button></>,
      conversationLabel: 'Astra conversation',
    }
    const { rerender } = render(
      <ShellWide {...props} conversationOpen={false}>
        <button type="button">Support</button>
      </ShellWide>,
    )
    const support = screen.getByRole('button', { name: 'Support' })
    fireEvent.click(support)

    rerender(
      <ShellWide {...props} conversationOpen>
        <button type="button">Support</button>
      </ShellWide>,
    )
    expect(screen.getByRole('button', { name: 'Close conversation' })).toHaveFocus()

    rerender(
      <ShellWide {...props} conversationOpen={false}>
        <button type="button">Support</button>
      </ShellWide>,
    )
    expect(support).toHaveFocus()
  })

  it.each([true, false])('returns conversation focus to the composer trigger with side panel=%s', (sidePanel) => {
    media.matches = sidePanel
    const props = {
      items,
      activeId: 'hoje',
      navLabel: 'Main navigation',
      composer: <button type="button">Open conversation</button>,
      conversation: <><BlurFocusedElement /><button type="button">Close conversation</button></>,
      conversationLabel: 'Astra conversation',
    }
    const { rerender } = render(<ShellWide {...props} conversationOpen={false} />)
    screen.getByRole('button', { name: 'Open conversation' }).focus()

    rerender(<ShellWide {...props} conversationOpen />)
    expect(screen.getByRole('button', { name: 'Close conversation' })).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Open conversation' })).not.toBeInTheDocument()

    rerender(<ShellWide {...props} conversationOpen={false} />)
    expect(screen.getByRole('button', { name: 'Open conversation' })).toHaveFocus()
  })

  it('omits navigation and uses the action slot in flow mode', () => {
    const { container } = render(
      <ShellWide nav={false} action={<button type="button">Continue</button>}>
        <h1>Upgrade</h1>
      </ShellWide>,
    )

    expect(container.querySelector('[data-shell-sidebar]')).not.toBeInTheDocument()
    expect(container.querySelector('[data-shell-pinned-slot]')).toHaveTextContent('Continue')
  })
})
