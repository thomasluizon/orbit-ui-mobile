import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ActionResult } from '@orbit/shared/types/chat'
import { ActionChips } from '@/components/chat/action-chips'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}))

function action(overrides: Partial<ActionResult> = {}): ActionResult {
  return {
    type: 'LogHabit',
    status: 'Success',
    entityId: 'habit-1',
    entityName: 'Meditate',
    ...overrides,
  }
}

describe('ActionChips', () => {
  it('renders legacy results as one block and omits suggestions', () => {
    render(<ActionChips actions={[action(), action({ status: 'Suggestion' })]} />)

    expect(screen.getByRole('heading', { name: 'chat.action.changes' })).toBeInTheDocument()
    expect(screen.getAllByText('status.done')).toHaveLength(1)
  })

  it('uses the frame failed state without exposing a server error', () => {
    const { container } = render(<ActionChips actions={[action({ status: 'Failed', error: 'database unavailable' })]} />)

    expect(container.querySelector('[data-state="partiallyFailed"]')).toBeInTheDocument()
    expect(screen.getByText('chat.operation.status.Failed')).toBeInTheDocument()
    expect(screen.queryByText('database unavailable')).not.toBeInTheDocument()
  })

  it('opens a successful navigable result', () => {
    const onChipClick = vi.fn()
    render(<ActionChips actions={[action()]} onChipClick={onChipClick} />)

    fireEvent.click(screen.getByRole('button', { name: 'chat.action.open' }))
    expect(onChipClick).toHaveBeenCalledWith('habit-1', 'LogHabit')
  })

  it('does not add a control for a destructive result', () => {
    render(<ActionChips actions={[action({ type: 'DeleteHabit' })]} onChipClick={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'chat.action.open' })).not.toBeInTheDocument()
  })

  it('localizes unknown operation symbols instead of rendering them', () => {
    render(<ActionChips actions={[action({ type: 'UnexpectedServerSymbol' })]} />)

    expect(screen.getByText('chat.action.completed')).toBeInTheDocument()
    expect(screen.queryByText(/UnexpectedServerSymbol/)).not.toBeInTheDocument()
  })
})
