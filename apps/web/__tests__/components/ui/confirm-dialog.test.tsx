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

  it('keeps breathing room below the description above the footer divider', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Delay task?"
        description="This moves the task to tomorrow."
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('This moves the task to tomorrow.').className).toContain('pb-4')
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

  it('renders danger variant by default', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Delete?"
        description="Sure?"
        onConfirm={vi.fn()}
      />,
    )
    const confirmBtn = screen.getByText('common.confirm')
    expect(confirmBtn.className).toContain('bg-red-500')
  })

  it('renders warning variant', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Warning"
        description="Proceed?"
        onConfirm={vi.fn()}
        variant="warning"
      />,
    )
    const confirmBtn = screen.getByText('common.confirm')
    expect(confirmBtn.className).toContain('bg-amber-500')
  })

  it('renders success variant', () => {
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
    const confirmBtn = screen.getByText('common.confirm')
    expect(confirmBtn.className).toContain('bg-green-500')
  })
})
