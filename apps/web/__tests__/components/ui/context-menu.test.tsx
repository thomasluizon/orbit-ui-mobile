import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/hooks/use-is-client', () => ({
  useIsClient: () => true,
}))

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
            React.forwardRef(function MotionMock(
              props: Record<string, unknown> & { children?: React.ReactNode },
              ref: React.Ref<HTMLElement>,
            ) {
              const { children, initial, animate, exit, transition, ...rest } = props
              return React.createElement(tag, { ...rest, ref }, children)
            }),
          )
        }
        return cache.get(tag)
      },
    }),
  }
})

import { useContextMenu, type ContextMenuItem } from '@/components/ui/context-menu'

function Harness({ items }: { items: ContextMenuItem[] }) {
  const { onContextMenu, contextMenu } = useContextMenu(items)
  return (
    <>
      <button type="button" data-testid="target" onContextMenu={onContextMenu}>
        target
      </button>
      {contextMenu}
    </>
  )
}

describe('useContextMenu', () => {
  it('opens a menu at the cursor on right-click', () => {
    const items: ContextMenuItem[] = [
      { key: 'a', label: 'Alpha', onSelect: vi.fn() },
      { key: 'b', label: 'Bravo', onSelect: vi.fn() },
    ]
    render(<Harness items={items} />)

    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.contextMenu(screen.getByTestId('target'), { clientX: 120, clientY: 80 })

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Alpha' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Bravo' })).toBeInTheDocument()
  })

  it('runs the selected item and closes the menu', () => {
    const onSelect = vi.fn()
    const items: ContextMenuItem[] = [{ key: 'a', label: 'Alpha', onSelect }]
    render(<Harness items={items} />)

    fireEvent.contextMenu(screen.getByTestId('target'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Alpha' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes on Escape', () => {
    const items: ContextMenuItem[] = [{ key: 'a', label: 'Alpha', onSelect: vi.fn() }]
    render(<Harness items={items} />)

    fireEvent.contextMenu(screen.getByTestId('target'))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('renders danger items but otherwise no-ops with no items', () => {
    const onSelect = vi.fn()
    const { rerender } = render(
      <Harness items={[{ key: 'd', label: 'Delete', onSelect, danger: true }]} />,
    )

    fireEvent.contextMenu(screen.getByTestId('target'))
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    rerender(<Harness items={[]} />)
    fireEvent.contextMenu(screen.getByTestId('target'))
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('useContextMenu positioning and keyboard navigation', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function open(items: ContextMenuItem[], coords?: { clientX: number; clientY: number }) {
    render(<Harness items={items} />)
    fireEvent.contextMenu(screen.getByTestId('target'), coords ?? { clientX: 120, clientY: 80 })
  }

  it('focuses the first row once the menu is positioned', () => {
    open([
      { key: 'a', label: 'Alpha', onSelect: vi.fn() },
      { key: 'b', label: 'Bravo', onSelect: vi.fn() },
    ])
    expect(screen.getByRole('menuitem', { name: 'Alpha' })).toHaveFocus()
  })

  it('clamps the origin back inside the viewport when the cursor is near the edge', () => {
    open([{ key: 'a', label: 'Alpha', onSelect: vi.fn() }], { clientX: 5000, clientY: 5000 })
    const menu = screen.getByRole('menu')
    expect(menu.style.left).not.toBe('5000px')
    expect(menu.style.top).not.toBe('5000px')
  })

  it('steps focus with the arrow, Home and End keys', () => {
    open([
      { key: 'a', label: 'Alpha', onSelect: vi.fn() },
      { key: 'b', label: 'Bravo', onSelect: vi.fn() },
      { key: 'c', label: 'Charlie', onSelect: vi.fn() },
    ])
    const menu = screen.getByRole('menu')
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Bravo' })).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'End' })
    expect(screen.getByRole('menuitem', { name: 'Charlie' })).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'Home' })
    expect(screen.getByRole('menuitem', { name: 'Alpha' })).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(screen.getByRole('menuitem', { name: 'Charlie' })).toHaveFocus()
  })

  it('ignores keys that are not navigation keys', () => {
    open([{ key: 'a', label: 'Alpha', onSelect: vi.fn() }])
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'x' })
    expect(screen.getByRole('menuitem', { name: 'Alpha' })).toHaveFocus()
  })

  it('closes when the viewport scrolls or resizes', () => {
    open([{ key: 'a', label: 'Alpha', onSelect: vi.fn() }])
    fireEvent.scroll(window)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes on an outside pointer press but not on an inside one', () => {
    open([{ key: 'a', label: 'Alpha', onSelect: vi.fn() }])
    fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Alpha' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
