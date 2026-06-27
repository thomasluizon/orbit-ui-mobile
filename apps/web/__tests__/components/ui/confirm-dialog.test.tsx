import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('dompurify', () => ({
  default: { sanitize: (html: string) => html },
}))

import { ConfirmDialog } from '@/components/ui/confirm-dialog'

describe('ConfirmDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        onOpenChange={vi.fn()}
        title="Delete?"
        description="Are you sure?"
        onConfirm={vi.fn()}
      />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders title and description when open', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Delete item?"
        description="This cannot be undone."
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByText('Delete item?')).toBeInTheDocument()
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument()
  })

  it('announces as an alert dialog with the description wired via aria-describedby', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Delay task?"
        description="This moves the task to tomorrow."
        onConfirm={vi.fn()}
      />,
    )

    const dialog = screen.getByRole('alertdialog')
    const desc = screen.getByText('This moves the task to tomorrow.') as HTMLElement
    expect(dialog.getAttribute('aria-describedby')).toBe(desc.id)
  })

  it('shows default confirm and cancel labels', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Delete?"
        description="Sure?"
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByText('common.confirm')).toBeInTheDocument()
    expect(screen.getByText('common.cancel')).toBeInTheDocument()
  })

  it('shows custom confirm and cancel labels', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Delete?"
        description="Sure?"
        confirmLabel="Yes, delete"
        cancelLabel="No, keep it"
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByText('Yes, delete')).toBeInTheDocument()
    expect(screen.getByText('No, keep it')).toBeInTheDocument()
  })

  it('calls onConfirm and closes on confirm click', () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Delete?"
        description="Sure?"
        onConfirm={onConfirm}
      />,
    )
    fireEvent.click(screen.getByText('common.confirm'))
    expect(onConfirm).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('calls onCancel and closes on cancel click', () => {
    const onCancel = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Delete?"
        description="Sure?"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    )
    fireEvent.click(screen.getByText('common.cancel'))
    expect(onCancel).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('confirms and closes when Enter is pressed', () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Delete?"
        description="Sure?"
        onConfirm={onConfirm}
      />,
    )
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onConfirm).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders the destructive (danger) confirm action as a status-bad fill pill — dlg-delete artboard', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Delete?"
        description="Sure?"
        onConfirm={vi.fn()}
      />,
    )
    const confirmBtn = screen.getByText('common.confirm') as HTMLElement
    expect(confirmBtn.getAttribute('data-variant')).toBe('danger')
  })

  it('renders non-destructive variants as a primary fill pill', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Complete?"
        description="Mark done?"
        onConfirm={vi.fn()}
        variant="success"
      />,
    )
    const confirmBtn = screen.getByText('common.confirm') as HTMLElement
    expect(confirmBtn.getAttribute('data-variant')).toBe('primary')
  })
})
