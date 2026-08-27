import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Sheet } from '@/components/ui/sheet'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

describe('Sheet', () => {
  it('keeps the body and fixed action row in separate slots', () => {
    render(
      <Sheet open title="Delete habit" actions={<button type="button">Delete</button>}>
        <p>Permanent action</p>
      </Sheet>,
    )

    expect(screen.getByText('Permanent action').closest('[data-slot="sheet-body"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Delete' }).closest('[data-slot="sheet-actions"]')).not.toBeNull()
  })

  it('finishes its exit before reporting close', async () => {
    const onClose = vi.fn()
    render(<Sheet open title="Options" onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('does not expose a dismiss control when no close handler exists', () => {
    render(<Sheet open title="Required action" />)
    expect(screen.queryByRole('button', { name: 'common.close' })).toBeNull()
  })
})
