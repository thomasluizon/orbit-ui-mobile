import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Shell412 } from '@/components/shell/shell-412'

describe('Shell412', () => {
  it('owns the notice, pinned composer, tab bar, and FAB slots', () => {
    const { container } = render(
      <Shell412
        notice={<div>Notice</div>}
        composer={<div>Composer</div>}
        tabBar={<div>Tabs</div>}
        fab={<button type="button">Create</button>}
      >
        <h1>Today</h1>
      </Shell412>,
    )

    expect(container.querySelector('[data-shell-notice]')).toHaveTextContent('Notice')
    expect(container.querySelector('[data-shell-pinned-slot]')).toHaveTextContent('Composer')
    expect(container.querySelector('[data-shell-tab-bar]')).toHaveTextContent('Tabs')
    expect(container.querySelector('[data-shell-fab]')).toHaveTextContent('Create')
    expect(screen.getAllByRole('heading')).toHaveLength(1)
  })

  it('uses the action slot and omits primary navigation in flow mode', () => {
    const { container } = render(
      <Shell412 nav={false} action={<button type="button">Continue</button>}>
        <h1>Upgrade</h1>
      </Shell412>,
    )

    expect(container.querySelector('[data-shell-pinned-slot]')).toHaveTextContent('Continue')
    expect(container.querySelector('[data-shell-tab-bar]')).not.toBeInTheDocument()
  })

  it('presents conversation as a modal overlay and hides the screen from interaction', () => {
    const { container } = render(
      <Shell412
        tabBar={<div>Tabs</div>}
        conversation={<div>Conversation</div>}
        conversationLabel="Astra conversation"
      >
        <h1>Today</h1>
      </Shell412>,
    )

    expect(screen.getByRole('dialog', { name: 'Astra conversation' })).toHaveTextContent('Conversation')
    expect(container.querySelector('[data-shell-scroller]')).toHaveAttribute('inert')
  })
})
