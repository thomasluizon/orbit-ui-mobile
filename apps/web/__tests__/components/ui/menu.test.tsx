import { createRef } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
