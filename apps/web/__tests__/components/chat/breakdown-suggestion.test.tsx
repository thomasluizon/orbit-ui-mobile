import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { BulkCreateResponse } from '@orbit/shared/types/habit'
import type { ConflictWarning, SuggestedSubHabit } from '@orbit/shared/types/chat'
import { BreakdownSuggestion } from '@/components/chat/breakdown-suggestion'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
}))

const bulkCreate = vi.fn<(request: unknown) => Promise<BulkCreateResponse>>()

vi.mock('@/hooks/use-habits', () => ({
  useBulkCreateHabits: () => ({ mutateAsync: bulkCreate, isPending: false }),
}))

const subHabits: SuggestedSubHabit[] = [
  { title: 'Dishes', description: '', frequencyUnit: 'Day' },
  { title: 'Laundry', description: '', frequencyUnit: 'Week' },
]

const defaultProps = {
  parentName: 'House routine',
  subHabits,
  onConfirmed: vi.fn(),
  onCancelled: vi.fn(),
}

function response(statuses: Array<'Success' | 'Failed'>): BulkCreateResponse {
  return {
    results: statuses.map((status, index) => ({
      index,
      status,
      habitId: status === 'Success' ? `habit-${index}` : null,
      title: subHabits[index]?.title ?? null,
      error: status === 'Failed' ? 'failed' : null,
      field: null,
    })),
  }
}

describe('BreakdownSuggestion', () => {
  beforeEach(() => {
    bulkCreate.mockReset()
    defaultProps.onConfirmed.mockReset()
  })

  it('withholds the batch until Approve is pressed', async () => {
    bulkCreate.mockResolvedValue(response(['Success', 'Success']))
    render(<BreakdownSuggestion {...defaultProps} />)

    expect(bulkCreate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'chat.preview.approve' }))

    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1))
    expect(defaultProps.onConfirmed).toHaveBeenCalledTimes(1)
  })

  it('collapses a rejected preview in place', () => {
    render(<BreakdownSuggestion {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: 'chat.preview.reject' }))

    expect(screen.getByRole('status')).toHaveTextContent('chat.preview.rejected')
    expect(screen.queryByRole('button', { name: 'chat.preview.approve' })).not.toBeInTheDocument()
  })

  it('edits one proposed row before approval', () => {
    render(<BreakdownSuggestion {...defaultProps} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'chat.preview.editItem' })[0]!)
    const input = screen.getByRole('textbox', { name: /chat\.preview\.editName/ })
    fireEvent.change(input, { target: { value: 'Kitchen dishes' } })

    expect(input).toHaveValue('Kitchen dishes')
  })

  it('changes frequency from the row control', () => {
    render(<BreakdownSuggestion {...defaultProps} />)
    const frequency = screen.getByRole('button', { name: /chat\.breakdown\.frequency.*Dishes/ })

    expect(frequency).toHaveTextContent('habits.filter.daily')
    fireEvent.click(frequency)
    expect(frequency).toHaveTextContent('habits.filter.weekly')
  })

  it('names a colliding habit above the actions', () => {
    const warning: ConflictWarning = {
      hasConflict: true,
      conflictingHabits: [{ habitId: 'habit-1', habitTitle: 'Dishes', conflictDescription: 'Monday' }],
      severity: 'HIGH',
    }
    render(<BreakdownSuggestion {...defaultProps} warning={warning} />)

    expect(screen.getByText(/chat\.breakdown\.conflict.*Dishes/)).toBeInTheDocument()
  })

  it('keeps successful rows and retries only failures', async () => {
    bulkCreate
      .mockResolvedValueOnce(response(['Success', 'Failed']))
      .mockResolvedValueOnce(response(['Success']))
    render(<BreakdownSuggestion {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: 'chat.preview.approve' }))
    const retry = await screen.findByRole('button', { name: /chat\.batch\.retry/ })
    fireEvent.click(retry)

    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(2))
    expect(bulkCreate.mock.calls[1]?.[0]).toMatchObject({ habits: [{ title: 'Laundry' }] })
  })
})
