import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { sheetTestControls } from '../../support/sheet-double'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/components/ui/sheet', async () => await import('../../support/sheet-double'))

afterEach(() => sheetTestControls.defer(false))

describe('ConfirmSheet controlled close', () => {
  it('finishes sheet dismissal before unmounting when open becomes false', () => {
    sheetTestControls.defer(true)
    const props = {
      title: 'Delete habit', message: 'Permanent action', confirmLabel: 'Delete',
      onCancel: vi.fn(), onConfirm: vi.fn(),
    }
    const { rerender } = render(<ConfirmSheet open {...props} />)

    rerender(<ConfirmSheet open={false} {...props} />)

    expect(sheetTestControls.isDismissPending).toBe(true)
    expect(screen.getByTestId('sheet')).toBeInTheDocument()
    act(() => sheetTestControls.completeDismissal())
    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument()
    expect(props.onConfirm).not.toHaveBeenCalled()

    rerender(<ConfirmSheet open {...props} />)
    expect(screen.getByTestId('sheet')).toBeInTheDocument()
  })

  it('ignores exit actions and reopens the revised confirmation after dismissal', () => {
    sheetTestControls.defer(true)
    const onOldConfirm = vi.fn()
    const onNewConfirm = vi.fn()
    const props = {
      message: 'Permanent action', confirmLabel: 'Delete', destructive: true,
      onCancel: vi.fn(),
    }
    const { rerender } = render(<ConfirmSheet open title="Old preview" onConfirm={onOldConfirm} {...props} />)

    rerender(<ConfirmSheet open={false} title="New preview" onConfirm={onNewConfirm} {...props} />)
    rerender(<ConfirmSheet open title="New preview" onConfirm={onNewConfirm} {...props} />)
    fireEvent.click(screen.getByText('Delete'))
    act(() => sheetTestControls.completeDismissal())

    expect(onOldConfirm).not.toHaveBeenCalled()
    expect(onNewConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'New preview' })).toBeInTheDocument()

    rerender(<ConfirmSheet open={false} title="New preview" onConfirm={onNewConfirm} {...props} />)
    rerender(<ConfirmSheet open title="New preview" onConfirm={onNewConfirm} {...props} />)
    fireEvent.click(screen.getByText('close-overlay'))
    act(() => sheetTestControls.completeDismissal())
    expect(screen.getByRole('dialog', { name: 'New preview' })).toBeInTheDocument()
    expect(props.onCancel).not.toHaveBeenCalled()
  })
})
