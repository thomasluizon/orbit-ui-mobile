import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { useOverlayEscape } from '@/hooks/use-overlay-escape'
import { isTopOverlay } from '@/lib/overlay-stack'

function Layer({
  open,
  onDismiss,
  id,
}: Readonly<{ open: boolean; onDismiss: (reason: string) => void; id: string }>) {
  useOverlayEscape({ open, onDismiss, restoreFocus: false })
  return open ? <div data-testid={id} /> : null
}

function pressEscape() {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
}

describe('useOverlayescape', () => {
  afterEach(cleanup)

  it('resolves Escape to the most recently opened layer (LIFO)', () => {
    const first = vi.fn()
    const second = vi.fn()

    const view = render(
      <>
        <Layer open onDismiss={first} id="first" />
        <Layer open onDismiss={second} id="second" />
      </>,
    )

    pressEscape()
    expect(second).toHaveBeenCalledWith('escape')
    expect(first).not.toHaveBeenCalled()

    view.rerender(
      <>
        <Layer open onDismiss={first} id="first" />
        <Layer open={false} onDismiss={second} id="second" />
      </>,
    )

    pressEscape()
    expect(first).toHaveBeenCalledWith('escape')
    expect(first).toHaveBeenCalledTimes(1)
  })

  it('unregisters from the overlay stack on unmount', () => {
    const view = render(<Layer open onDismiss={vi.fn()} id="solo" />)
    view.unmount()
    expect(isTopOverlay).toBeDefined()
    expect(document.querySelector('[data-testid="solo"]')).toBeNull()
  })

  it('does not fire when the layer is closed', () => {
    const onDismiss = vi.fn()
    render(<Layer open={false} onDismiss={onDismiss} id="closed" />)
    pressEscape()
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('restores focus to the previously focused element on close', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    function Restoring({ open }: Readonly<{ open: boolean }>) {
      useOverlayEscape({ open, onDismiss: vi.fn(), restoreFocus: true })
      return open ? <button data-testid="inside">x</button> : null
    }

    const view = render(<Restoring open />)
    view.rerender(<Restoring open={false} />)

    expect(document.activeElement).toBe(trigger)
    document.body.removeChild(trigger)
  })
})
