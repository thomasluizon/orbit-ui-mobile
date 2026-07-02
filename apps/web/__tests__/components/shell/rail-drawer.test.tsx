import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/use-is-client', () => ({
  useIsClient: () => true,
}))

import { RailDrawer } from '@/components/shell/rail-drawer'

function renderDrawer(open: boolean, onClose: () => void = vi.fn()) {
  render(
    <RailDrawer open={open} onClose={onClose}>
      <p>Rail body</p>
    </RailDrawer>,
  )
  return onClose
}

describe('RailDrawer', () => {
  it('renders the rail content when open', () => {
    renderDrawer(true)
    expect(screen.getByText('Rail body')).toBeInTheDocument()
  })

  it('does not render the rail content when closed', () => {
    renderDrawer(false)
    expect(screen.queryByText('Rail body')).not.toBeInTheDocument()
  })

  it('closes when Escape is pressed', () => {
    const onClose = vi.fn()
    renderDrawer(true, onClose)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when the scrim is clicked', () => {
    const onClose = vi.fn()
    renderDrawer(true, onClose)
    fireEvent.click(screen.getByLabelText('common.close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('moves focus into the panel when opened', async () => {
    renderDrawer(true)
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus())
  })

  it('keeps Tab cycling inside the panel focusables', async () => {
    render(
      <RailDrawer open onClose={vi.fn()}>
        <button type="button">Retry</button>
      </RailDrawer>,
    )
    const inner = screen.getByRole('button', { name: 'Retry' })
    inner.focus()

    fireEvent.keyDown(document, { key: 'Tab' })

    expect(inner).toHaveFocus()
  })

  it('holds focus on the panel when it has no focusable children', async () => {
    renderDrawer(true)
    const panel = screen.getByRole('dialog')
    await waitFor(() => expect(panel).toHaveFocus())

    fireEvent.keyDown(document, { key: 'Tab' })

    expect(panel).toHaveFocus()
  })

  it('restores focus to the previously focused element on close', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()

    const { rerender } = render(
      <RailDrawer open onClose={vi.fn()}>
        <p>Rail body</p>
      </RailDrawer>,
    )
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus())

    rerender(
      <RailDrawer open={false} onClose={vi.fn()}>
        <p>Rail body</p>
      </RailDrawer>,
    )

    expect(opener).toHaveFocus()
    opener.remove()
  })
})
