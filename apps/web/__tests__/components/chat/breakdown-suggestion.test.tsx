import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { BulkCreateResponse } from '@orbit/shared/types/habit'
import type { ConflictWarning } from '@orbit/shared/types/chat'
import {
  breakdownSubHabits as subHabits,
  makeBulkCreateResponse,
} from '@orbit/shared/test-support/chat-fixtures'
import { BreakdownSuggestion } from '@/components/chat/breakdown-suggestion'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
}))

vi.mock('@/components/ui/confirm-sheet', () => ({
  ConfirmSheet: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
    open ? <button type="button" onClick={onConfirm}>confirm-breakdown</button> : null,
}))

const bulkCreate = vi.fn<(request: unknown) => Promise<BulkCreateResponse>>()

vi.mock('@/hooks/use-habits', () => ({
  useBulkCreateHabits: () => ({ mutateAsync: bulkCreate, isPending: false }),
}))

const defaultProps = {
  parentName: 'House routine',
  subHabits,
  onConfirmed: vi.fn(),
  onCancelled: vi.fn(),
}

describe('BreakdownSuggestion', () => {
  beforeEach(() => {
    bulkCreate.mockReset()
    defaultProps.onConfirmed.mockReset()
  })

  it('withholds the batch until the approval sheet is confirmed', async () => {
    bulkCreate.mockResolvedValue(makeBulkCreateResponse(['Success', 'Success']))
    render(<BreakdownSuggestion {...defaultProps} />)

    expect(bulkCreate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'chat.preview.approve' }))
    expect(bulkCreate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'confirm-breakdown' }))

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
    expect(input).toHaveClass('text-base')
  })

  it('changes frequency from the row control', () => {
    render(<BreakdownSuggestion {...defaultProps} />)
    const frequency = screen.getByRole('button', { name: /chat\.breakdown\.frequency.*Dishes/ })

    expect(frequency).toHaveTextContent('habits.filter.daily')
    fireEvent.click(frequency)
    expect(frequency).toHaveTextContent('habits.filter.weekly')
  })

  it('preserves yearly and one-time proposal cadences', () => {
    render(<BreakdownSuggestion
      {...defaultProps}
      subHabits={[
        { title: 'Year review', frequencyUnit: 'Year' },
        { title: 'File taxes', frequencyUnit: null },
      ]}
    />)
    const yearly = screen.getByRole('button', { name: /chat\.breakdown\.frequency.*Year review/ })
    const oneTime = screen.getByRole('button', { name: /chat\.breakdown\.frequency.*File taxes/ })

    expect(yearly).toHaveTextContent('habits.filter.yearly')
    expect(oneTime).toHaveTextContent('habits.filter.oneTime')
    fireEvent.click(yearly)
    expect(yearly).toHaveTextContent('habits.filter.oneTime')
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
      .mockResolvedValueOnce(makeBulkCreateResponse(['Success', 'Failed']))
      .mockResolvedValueOnce(makeBulkCreateResponse(['Success']))
    render(<BreakdownSuggestion {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: 'chat.preview.approve' }))
    fireEvent.click(screen.getByRole('button', { name: 'confirm-breakdown' }))
    const retry = await screen.findByRole('button', { name: /chat\.batch\.retry/ })
    fireEvent.click(retry)

    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(2))
    expect(bulkCreate.mock.calls[1]?.[0]).toMatchObject({ habits: [{ title: 'Laundry' }] })
  })
})
