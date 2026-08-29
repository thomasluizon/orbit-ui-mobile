import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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
    expect(container.querySelector('[data-shell-background]')).toHaveAttribute('inert')
    expect(container.querySelector('[data-shell-background]')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('[data-shell-bottom]')).toHaveStyle({ paddingBottom: 'var(--safe-bottom)' })
  })

  it('contains focus in the conversation and returns it to the Astra trigger', () => {
    const props = {
      tabBar: <div>Tabs</div>,
      composer: <button type="button">Open conversation</button>,
      conversation: (
        <div>
          <button type="button">First action</button>
          <button type="button">Last action</button>
        </div>
      ),
      conversationLabel: 'Astra conversation',
    }
    const { rerender } = render(
      <Shell412 {...props} conversationOpen={false}><h1>Today</h1></Shell412>,
    )
    const trigger = screen.getByRole('button', { name: 'Open conversation' })
    trigger.focus()

    rerender(<Shell412 {...props} conversationOpen><h1>Today</h1></Shell412>)
    const firstAction = screen.getByRole('button', { name: 'First action' })
    const lastAction = screen.getByRole('button', { name: 'Last action' })
    expect(firstAction).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(lastAction).toHaveFocus()

    lastAction.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(firstAction).toHaveFocus()

    trigger.focus()
    expect(firstAction).toHaveFocus()

    rerender(<Shell412 {...props} conversationOpen={false}><h1>Today</h1></Shell412>)
    expect(trigger).toHaveFocus()
  })

  it('keeps focus on an empty conversation dialog', () => {
    render(
      <Shell412
        tabBar={<div>Tabs</div>}
        conversation={<div>Conversation copy</div>}
        conversationLabel="Astra conversation"
      />,
    )
    const dialog = screen.getByRole('dialog', { name: 'Astra conversation' })

    expect(dialog).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(dialog).toHaveFocus()
  })
})
