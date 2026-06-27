import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { CenteredOverlay } from '@/components/ui/centered-overlay'

describe('CenteredOverlay', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <CenteredOverlay open={false} onDismiss={vi.fn()} ariaLabel="Picker">
        <p>Content</p>
      </CenteredOverlay>,
    )
    expect(container.innerHTML).toBe('')
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('portals the dialog to document.body rather than the app-shell container', () => {
    const { container } = render(
      <CenteredOverlay open onDismiss={vi.fn()} ariaLabel="Picker">
        <p>Content</p>
      </CenteredOverlay>,
    )

    expect(container.querySelector('dialog')).toBeNull()
    const dialog = document.querySelector('dialog')
    expect(dialog).not.toBeNull()
    expect(document.body.contains(dialog)).toBe(true)
  })

  it('renders a full-viewport fixed backdrop above the shell', () => {
    render(
      <CenteredOverlay open onDismiss={vi.fn()} ariaLabel="Picker">
        <p>Content</p>
      </CenteredOverlay>,
    )

    const dialog = document.querySelector('dialog')!
    const root = dialog.parentElement!
    expect(root.className).toContain('fixed')
    expect(root.className).toContain('inset-0')
  })

  it('exposes the panel as an accessible modal dialog', () => {
    render(
      <CenteredOverlay open onDismiss={vi.fn()} ariaLabel="Year picker">
        <p>Content</p>
      </CenteredOverlay>,
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', 'Year picker')
  })

  it('prefers a labelling element id over a literal label', () => {
    render(
      <CenteredOverlay open onDismiss={vi.fn()} ariaLabel="ignored" ariaLabelledBy="label-id">
        <h2 id="label-id">Visible title</h2>
      </CenteredOverlay>,
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-labelledby', 'label-id')
    expect(dialog).not.toHaveAttribute('aria-label')
  })

  it('renders children content', () => {
    render(
      <CenteredOverlay open onDismiss={vi.fn()} ariaLabel="Picker">
        <button>Pick me</button>
      </CenteredOverlay>,
    )
    expect(screen.getByText('Pick me')).toBeInTheDocument()
  })

  it('calls onDismiss when the backdrop is clicked', () => {
    const onDismiss = vi.fn()
    render(
      <CenteredOverlay open onDismiss={onDismiss} ariaLabel="Picker">
        <p>Content</p>
      </CenteredOverlay>,
    )

    fireEvent.click(screen.getByLabelText('common.close'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('calls onDismiss on Escape', () => {
    const onDismiss = vi.fn()
    render(
      <CenteredOverlay open onDismiss={onDismiss} ariaLabel="Picker">
        <p>Content</p>
      </CenteredOverlay>,
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalled()
  })

  it('only lets the topmost overlay handle Escape', () => {
    const firstDismiss = vi.fn()
    const secondDismiss = vi.fn()

    render(
      <>
        <CenteredOverlay open onDismiss={firstDismiss} ariaLabel="First">
          <p>First</p>
        </CenteredOverlay>
        <CenteredOverlay open onDismiss={secondDismiss} ariaLabel="Second">
          <p>Second</p>
        </CenteredOverlay>
      </>,
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(secondDismiss).toHaveBeenCalled()
    expect(firstDismiss).not.toHaveBeenCalled()
  })
})
