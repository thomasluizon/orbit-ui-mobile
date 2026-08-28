import { createRef, useEffect, useRef, useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Menu } from '@/components/ui/menu'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

function setWide(matches: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

const items = [
  { id: 'delete', label: 'Delete', destructive: true },
  { id: 'edit', label: 'Edit' },
] as const

describe('Menu', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('uses the sheet presentation at 412 and orders the destructive item last', async () => {
    setWide(false)
    render(<Menu open title="Habit actions" items={items} />)

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    const rows = screen.getAllByRole('menuitem')
    expect(rows.map((row) => row.textContent)).toEqual(['Edit', 'Delete'])
    expect(rows[1]).toHaveAttribute('data-destructive')
  })

  it('uses an anchored menu at the wide width and reports only the item id', async () => {
    setWide(true)
    const anchorRef = createRef<HTMLButtonElement>()
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(
      <>
        <button ref={anchorRef} type="button">More</button>
        <Menu open title="Habit actions" items={items} anchorRef={anchorRef} onSelect={onSelect} onClose={onClose} />
      </>,
    )

    await waitFor(() => expect(screen.getByRole('menu')).toHaveAttribute('data-positioned'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(onSelect).toHaveBeenCalledWith('edit')
    expect(onSelect.mock.calls[0]).toHaveLength(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders nothing when it is closed or has no items', () => {
    setWide(true)
    const { rerender } = render(<Menu items={items} />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    rerender(<Menu open items={[]} />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('moves focus with the arrow keys, Home and End, and wraps at both ends', async () => {
    setWide(true)
    const anchorRef = createRef<HTMLButtonElement>()
    render(
      <>
        <button ref={anchorRef} type="button">More</button>
        <Menu open title="Habit actions" items={items} anchorRef={anchorRef} />
      </>,
    )

    const menu = await screen.findByRole('menu')
    const edit = screen.getByRole('menuitem', { name: 'Edit' })
    const remove = screen.getByRole('menuitem', { name: 'Delete' })
    await waitFor(() => expect(edit).toHaveFocus())

    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(remove).toHaveFocus()

    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(edit).toHaveFocus()

    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(remove).toHaveFocus()

    fireEvent.keyDown(menu, { key: 'Home' })
    expect(edit).toHaveFocus()

    fireEvent.keyDown(menu, { key: 'End' })
    expect(remove).toHaveFocus()
  })

  it('ignores a key it does not own', async () => {
    setWide(true)
    const anchorRef = createRef<HTMLButtonElement>()
    render(
      <>
        <button ref={anchorRef} type="button">More</button>
        <Menu open title="Habit actions" items={items} anchorRef={anchorRef} />
      </>,
    )

    const menu = await screen.findByRole('menu')
    const edit = screen.getByRole('menuitem', { name: 'Edit' })
    await waitFor(() => expect(edit).toHaveFocus())

    fireEvent.keyDown(menu, { key: 'a' })
    expect(edit).toHaveFocus()
  })

  it.each([
    ['Tab', false],
    ['Shift+Tab', true],
  ])('closes on %s and leaves a context-menu row in the same keypress', async (_label, shiftKey) => {
    setWide(true)
    const user = userEvent.setup()
    let activeElementAtOpen: Element | null = null
    function Harness() {
      const anchorRef = useRef<HTMLDivElement>(null)
      const [open, setOpen] = useState(false)

      useEffect(() => {
        const anchor = anchorRef.current
        if (!anchor) return
        const openMenu = (event: MouseEvent) => {
          event.preventDefault()
          activeElementAtOpen = document.activeElement
          setOpen(true)
        }
        const preservePointerFocus = (event: MouseEvent) => event.preventDefault()
        anchor.addEventListener('mousedown', preservePointerFocus)
        anchor.addEventListener('contextmenu', openMenu)
        return () => {
          anchor.removeEventListener('mousedown', preservePointerFocus)
          anchor.removeEventListener('contextmenu', openMenu)
        }
      }, [])

      return (
        <>
          <button type="button">Unrelated</button>
          <button type="button">Before</button>
          <div ref={anchorRef} tabIndex={-1}>
            <span>Habit row</span>
          </div>
          <button type="button">After</button>
          <Menu
            open={open}
            title="Habit actions"
            items={items}
            anchorRef={anchorRef}
            onClose={() => setOpen(false)}
          />
        </>
      )
    }
    render(<Harness />)

    screen.getByRole('button', { name: 'Unrelated' }).focus()
    expect(screen.getByRole('button', { name: 'Unrelated' })).toHaveFocus()
    await user.pointer({ target: screen.getByText('Habit row'), keys: '[MouseRight]' })
    expect(activeElementAtOpen).toBe(screen.getByRole('button', { name: 'Unrelated' }))
    await screen.findByRole('menu')
    const edit = screen.getByRole('menuitem', { name: 'Edit' })
    await waitFor(() => expect(edit).toHaveFocus())

    await user.tab({ shift: shiftKey })

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: shiftKey ? 'Before' : 'After' })).toHaveFocus()
    expect(document.activeElement?.getAttribute('role')).not.toBe('menuitem')
  })

  it.each([
    ['Tab', false],
    ['Shift+Tab', true],
  ])('closes on %s and leaves a button anchor in the same keypress', async (_label, shiftKey) => {
    setWide(true)
    const user = userEvent.setup()
    function Harness() {
      const anchorRef = useRef<HTMLButtonElement>(null)
      const [open, setOpen] = useState(false)

      return (
        <>
          <button type="button">Before</button>
          <button ref={anchorRef} type="button" onClick={() => setOpen(true)}>
            More
          </button>
          <button type="button">After</button>
          <Menu
            open={open}
            title="Habit actions"
            items={items}
            anchorRef={anchorRef}
            onClose={() => setOpen(false)}
          />
        </>
      )
    }
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await screen.findByRole('menu')
    const edit = screen.getByRole('menuitem', { name: 'Edit' })
    await waitFor(() => expect(edit).toHaveFocus())

    await user.tab({ shift: shiftKey })

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: shiftKey ? 'Before' : 'After' })).toHaveFocus()
    expect(document.activeElement?.getAttribute('role')).not.toBe('menuitem')
  })

  it('closes on Escape and on a pointer press outside the panel', async () => {
    setWide(true)
    const anchorRef = createRef<HTMLButtonElement>()
    const onClose = vi.fn()
    render(
      <>
        <button ref={anchorRef} type="button">More</button>
        <Menu open title="Habit actions" items={items} anchorRef={anchorRef} onClose={onClose} />
      </>,
    )

    await screen.findByRole('menu')

    fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.pointerDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)

    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  /**
   * The trigger toggles on click, which lands after the document pointerdown.
   * Closing on that pointerdown let the toggle read the closed state and reopen,
   * so an anchored overflow menu could never be dismissed by its own button.
   */
  it('lets its own trigger close it instead of reopening', async () => {
    setWide(true)
    function Harness() {
      const anchorRef = useRef<HTMLButtonElement>(null)
      const [open, setOpen] = useState(true)
      return (
        <>
          <button
            ref={anchorRef}
            type="button"
            onClick={() => setOpen((current) => !current)}
          >
            More
          </button>
          <Menu
            open={open}
            title="Habit actions"
            items={items}
            anchorRef={anchorRef}
            onClose={() => setOpen(false)}
          />
        </>
      )
    }
    render(<Harness />)

    await screen.findByRole('menu')

    const trigger = screen.getByText('More')
    fireEvent.pointerDown(trigger)
    fireEvent.click(trigger)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('aligns to the anchor start when asked', async () => {
    setWide(true)
    const anchorRef = createRef<HTMLButtonElement>()
    const { rerender } = render(
      <>
        <button ref={anchorRef} type="button">More</button>
        <Menu items={items} anchorRef={anchorRef} align="start" />
      </>,
    )
    anchorRef.current!.getBoundingClientRect = () =>
      ({ left: 120, right: 200, top: 40, bottom: 72, width: 80, height: 32 }) as DOMRect

    rerender(
      <>
        <button ref={anchorRef} type="button">More</button>
        <Menu open title="Habit actions" items={items} anchorRef={anchorRef} align="start" />
      </>,
    )

    const menu = await screen.findByRole('menu')
    await waitFor(() => expect(menu).toHaveAttribute('data-positioned'))
    expect(menu).toHaveStyle({ left: '120px', top: '80px' })
    expect(menu.style.transformOrigin).toBe('left top')
  })

  it('opens upward when there is no room below the anchor', async () => {
    setWide(true)
    const anchorRef = createRef<HTMLButtonElement>()
    const { rerender } = render(
      <>
        <button ref={anchorRef} type="button">More</button>
        <Menu items={items} anchorRef={anchorRef} />
      </>,
    )
    anchorRef.current!.getBoundingClientRect = () =>
      ({ left: 120, right: 200, top: 700, bottom: 900, width: 80, height: 200 }) as DOMRect

    rerender(
      <>
        <button ref={anchorRef} type="button">More</button>
        <Menu open title="Habit actions" items={items} anchorRef={anchorRef} />
      </>,
    )

    const menu = await screen.findByRole('menu')
    await waitFor(() => expect(menu).toHaveAttribute('data-positioned'))
    expect(menu.style.transformOrigin).toBe('right bottom')
    expect(menu).toHaveStyle({ top: '692px' })
  })

  it('honours an explicit sheet presentation at the wide width', async () => {
    setWide(true)
    render(<Menu open title="Habit actions" items={items} presentation="sheet" />)

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('keeps a badged disabled route selectable', async () => {
    setWide(false)
    const onSelect = vi.fn()
    render(
      <Menu
        open
        items={[{ id: 'pro', label: 'API keys', badge: 'Pro', disabled: true }]}
        onSelect={onSelect}
      />,
    )

    const item = await screen.findByRole('menuitem')
    expect(item).not.toBeDisabled()
    fireEvent.click(item)
    expect(onSelect).toHaveBeenCalledWith('pro')
  })
})
