import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('motion/react', async () => {
  const React = await import('react')
  const cache = new Map<string, unknown>()
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useReducedMotion: () => false,
    motion: new Proxy({} as Record<string, unknown>, {
      get(_target, tag) {
        if (typeof tag !== 'string') return undefined
        if (!cache.has(tag)) {
          cache.set(
            tag,
            function MotionMock({
              children,
              ref,
              ...props
            }: { children?: React.ReactNode; ref?: React.Ref<HTMLElement> }) {
              return React.createElement(tag, { ...props, ref }, children)
            },
          )
        }
        return cache.get(tag)
      },
    }),
  }
})

vi.mock('@/hooks/use-is-client', () => ({ useIsClient: () => true }))

vi.mock('@orbit/shared/theme', () => ({
  resolveMotionPreset: () => ({
    shift: 8,
    scaleFrom: 0.98,
    scaleTo: 1,
    enterDuration: 120,
    enterEasing: 'ease',
    exitDuration: 100,
    exitEasing: 'ease',
  }),
}))

import { Popover } from '@/components/ui/popover'

function PanelButtons() {
  return (
    <>
      <button type="button">one</button>
      <button type="button">two</button>
      <button type="button">three</button>
    </>
  )
}

describe('Popover', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => {
      callback(0)
      return 0
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens on trigger click and focuses the first focusable panel element', () => {
    render(
      <Popover trigger={<button type="button">Open menu</button>}>
        <PanelButtons />
      </Popover>,
    )

    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'one' }))
  })

  it('navigates focus with ArrowDown/ArrowUp/Home/End and wraps around', () => {
    render(
      <Popover trigger={<button type="button">Open menu</button>}>
        <PanelButtons />
      </Popover>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    const panel = screen.getByRole('dialog')
    const [one, two, three] = ['one', 'two', 'three'].map((name) =>
      screen.getByRole('button', { name }),
    )

    fireEvent.keyDown(panel, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(two)

    fireEvent.keyDown(panel, { key: 'End' })
    expect(document.activeElement).toBe(three)

    fireEvent.keyDown(panel, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(one)

    fireEvent.keyDown(panel, { key: 'Home' })
    expect(document.activeElement).toBe(one)

    fireEvent.keyDown(panel, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(three)
  })

  it('ignores keys that are not navigation keys', () => {
    render(
      <Popover trigger={<button type="button">Open menu</button>}>
        <PanelButtons />
      </Popover>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    const one = screen.getByRole('button', { name: 'one' })
    one.focus()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'a' })
    expect(document.activeElement).toBe(one)
  })

  it('closes on Escape and returns focus to the trigger', () => {
    render(
      <Popover trigger={<button type="button">Open menu</button>}>
        <PanelButtons />
      </Popover>,
    )
    const trigger = screen.getByRole('button', { name: 'Open menu' })
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('supports controlled mode with a render-prop close callback', () => {
    const onOpenChange = vi.fn()
    render(
      <Popover
        trigger={<button type="button">Trigger</button>}
        open
        onOpenChange={onOpenChange}
      >
        {(close) => (
          <button type="button" onClick={close}>
            dismiss
          </button>
        )}
      </Popover>,
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'dismiss' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
