import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

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
