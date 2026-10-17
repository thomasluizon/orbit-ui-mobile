import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiClientError } from '@orbit/shared/utils'
import type { BulkCreateRequest, BulkCreateResponse } from '@orbit/shared/types/habit'
import { breakdownSubHabits, makeBulkCreateResponse } from '@orbit/shared/test-support/chat-fixtures'
import { BreakdownSuggestion } from '@/components/chat/breakdown-suggestion'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/components/ui/confirm-sheet', () => ({
  ConfirmSheet: ({ open, onConfirm, onCancel }: { open: boolean; onConfirm: () => void; onCancel: () => void }) => open ? <div><button onClick={onConfirm}>Confirm breakdown</button><button onClick={onCancel}>Cancel confirmation</button></div> : null,
}))
const bulkCreate = vi.fn<(request: BulkCreateRequest) => Promise<BulkCreateResponse>>()
vi.mock('@/hooks/use-habits', () => ({ useBulkCreateHabits: () => ({ mutateAsync: bulkCreate, isPending: false }) }))
const onConfirmed = vi.fn()
const props = { parentName: 'House routine', subHabits: breakdownSubHabits, onConfirmed, onCancelled: vi.fn() }
const grouping = () => screen.getByRole('checkbox', { name: 'habits.breakdown.createAsParent' })
function approve() {
  fireEvent.click(screen.getByRole('button', { name: 'chat.preview.approve' }))
  expect(bulkCreate).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm breakdown' }))
}
function expectCompleted() {
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  for (const name of ['chat.preview.approve', 'chat.preview.edit', 'chat.preview.reject', 'chat.batch.retry']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
  expect(screen.getByText('chat.action.completed')).toHaveAttribute('role', 'status')
}
function expectParentRequest() {
  const request = bulkCreate.mock.calls[0]![0]
  expect(request.habits).toHaveLength(1)
  expect(request.habits[0]).toMatchObject({ title: 'House routine', frequencyUnit: 'Day', subHabits: [{ title: 'Dishes' }, { title: 'Laundry' }] })
}
beforeEach(() => { bulkCreate.mockReset(); onConfirmed.mockReset() })

describe('breakdown parent choice', () => {
  it('preserves mixed child schedules after API cadence inheritance', async () => {
    bulkCreate.mockResolvedValue(makeBulkCreateResponse(['Success']))
    render(<BreakdownSuggestion {...props} subHabits={[{ title: 'Dishes', frequencyUnit: 'Day', frequencyQuantity: 2 }, { title: 'Buy detergent' }]} />)
    fireEvent.click(grouping())
    approve()
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1))
    const parent = bulkCreate.mock.calls[0]![0].habits[0]!
    expect(parent.subHabits?.map(child => ({ title: child.title, frequencyUnit: child.frequencyUnit ?? parent.frequencyUnit ?? null, frequencyQuantity: child.frequencyQuantity ?? parent.frequencyQuantity ?? null }))).toEqual([
      { title: 'Dishes', frequencyUnit: 'Day', frequencyQuantity: 2 },
      { title: 'Buy detergent', frequencyUnit: null, frequencyQuantity: null },
    ])
  })

  it('recovers from a persistent grouping denial without losing edited drafts', async () => {
    bulkCreate.mockImplementation(request => {
      if (request.habits.some(habit => habit.subHabits?.length)) return Promise.reject(createApiClientError(403, { error: 'Sub-habits require Pro', errorCode: 'PAY_GATE' }, 'Forbidden'))
      return Promise.resolve(makeBulkCreateResponse(['Success', 'Success']))
    })
    render(<BreakdownSuggestion {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.preview.edit' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Wash dishes' } })
    fireEvent.blur(screen.getByRole('textbox'))
    fireEvent.click(grouping())
    approve()
    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(grouping()).not.toBeDisabled())
    expect(onConfirmed).not.toHaveBeenCalled()
    expect(screen.getByText('errors.api.payGate')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.preview.approve' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm breakdown' }))
    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(grouping()).not.toBeDisabled())
    fireEvent.click(grouping())
    fireEvent.click(screen.getByRole('button', { name: 'chat.preview.approve' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm breakdown' }))
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1))
    expect(bulkCreate.mock.calls[2]![0].habits.map(habit => habit.title)).toEqual(['Wash dishes', 'Laundry'])
    expect(bulkCreate.mock.calls[2]![0].habits.every(habit => habit.subHabits === undefined)).toBe(true)
    expectCompleted()
  })

  it.each([false, true])('creates independent habits after opting back out: %s', async (toggle) => {
    bulkCreate.mockResolvedValue(makeBulkCreateResponse(['Success', 'Success']))
    render(<BreakdownSuggestion {...props} />)
    expect(grouping()).not.toBeChecked()
    if (toggle) { fireEvent.click(grouping()); fireEvent.click(grouping()) }
    approve()
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1))
    expect(bulkCreate.mock.calls[0]![0].habits.map(habit => habit.title)).toEqual(['Dishes', 'Laundry'])
    expect(bulkCreate.mock.calls[0]![0].habits.every(habit => habit.subHabits === undefined)).toBe(true)
    expectCompleted()
  })

  it('creates a parent only after confirmation and marks every child done', async () => {
    bulkCreate.mockResolvedValue(makeBulkCreateResponse(['Success']))
    render(<BreakdownSuggestion {...props} />)
    fireEvent.click(grouping())
    expect(grouping()).toBeChecked()
    approve()
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1))
    expectParentRequest()
    expect(document.querySelectorAll('[data-status="done"]')).toHaveLength(2)
    expectCompleted()
  })

  it('retains the parent choice when confirmation is cancelled', () => {
    render(<BreakdownSuggestion {...props} />)
    fireEvent.click(grouping())
    fireEvent.click(screen.getByRole('button', { name: 'chat.preview.approve' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel confirmation' }))
    expect(grouping()).toBeChecked()
    expect(bulkCreate).not.toHaveBeenCalled()
    expect(onConfirmed).not.toHaveBeenCalled()
  })

  it('keeps grouping locked if a denial follows an ambiguous write', async () => {
    bulkCreate.mockRejectedValueOnce(new Error('Connection lost'))
      .mockRejectedValueOnce(createApiClientError(403, { error: 'Sub-habits require Pro', errorCode: 'PAY_GATE' }, 'Forbidden'))
    render(<BreakdownSuggestion {...props} />)
    fireEvent.click(grouping())
    approve()
    fireEvent.click(await screen.findByRole('button', { name: 'chat.batch.retry' }))
    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(2))
    expect(grouping()).toBeDisabled()
    expect(grouping()).toBeChecked()
    expect(screen.queryByRole('button', { name: 'chat.preview.approve' })).not.toBeInTheDocument()
    expect(onConfirmed).not.toHaveBeenCalled()
  })

  it.each(['response', 'transport', 'uncoded denial', 'server'])('retries the entire parent after a %s failure', async (failure) => {
    if (failure === 'transport') bulkCreate.mockRejectedValueOnce(new Error('Unavailable'))
    else if (failure === 'uncoded denial') bulkCreate.mockRejectedValueOnce(createApiClientError(403, { error: 'Forbidden' }, 'Forbidden'))
    else if (failure === 'server') bulkCreate.mockRejectedValueOnce(createApiClientError(500, { error: 'Unavailable', errorCode: 'PAY_GATE' }, 'Unavailable'))
    else bulkCreate.mockResolvedValueOnce(makeBulkCreateResponse(['Failed']))
    let finish!: (response: BulkCreateResponse) => void
    bulkCreate.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    render(<BreakdownSuggestion {...props} />)
    fireEvent.click(grouping())
    approve()
    const retry = await screen.findByRole('button', { name: 'chat.batch.retry' })
    expect(onConfirmed).not.toHaveBeenCalled()
    expectParentRequest()
    expect(document.querySelectorAll('[data-status="failed"]')).toHaveLength(2)
    expect(grouping()).toBeChecked()
    expect(grouping()).toBeDisabled()
    fireEvent.click(retry)
    expect(screen.getByRole('button', { name: 'chat.batch.retry' })).toBeDisabled()
    await act(async () => { finish(makeBulkCreateResponse(['Success'])); await Promise.resolve() })
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1))
    expect(bulkCreate).toHaveBeenCalledTimes(2)
    expect(bulkCreate.mock.calls[1]![0]).toEqual(bulkCreate.mock.calls[0]![0])
    expect(document.querySelectorAll('[data-status="done"]')).toHaveLength(2)
    expectCompleted()
  })

  it.each([false, true])('keeps omitted blanks locked through failure and retry with grouping %s', async (createAsParent) => {
    bulkCreate.mockResolvedValueOnce(makeBulkCreateResponse(['Failed'])).mockResolvedValueOnce(makeBulkCreateResponse(['Success']))
    render(<BreakdownSuggestion {...props} subHabits={[{ title: ' ' }, { title: 'Dishes', frequencyUnit: 'Day' }]} />)
    if (createAsParent) fireEvent.click(grouping())
    approve()
    const retry = await screen.findByRole('button', { name: 'chat.batch.retry' })
    expect(screen.queryByRole('button', { name: 'chat.preview.editItem' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'chat.breakdown.frequency' })).toBeDisabled()
    fireEvent.click(retry)
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1))
    expect(bulkCreate.mock.calls[1]![0]).toEqual(bulkCreate.mock.calls[0]![0])
    expect(document.querySelectorAll('[data-status="done"]')).toHaveLength(1)
    expectCompleted()
  })

  it('locks grouping, editing and approval while the parent request is pending', async () => {
    let finish!: (response: BulkCreateResponse) => void
    bulkCreate.mockReturnValue(new Promise(resolve => { finish = resolve }))
    render(<BreakdownSuggestion {...props} />)
    fireEvent.click(grouping())
    approve()
    expect(grouping()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'chat.preview.approve' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'chat.preview.edit' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'chat.preview.reject' })).toBeDisabled()
    fireEvent.click(grouping())
    expect(grouping()).toBeChecked()
    expect(bulkCreate).toHaveBeenCalledTimes(1)
    await act(async () => { finish(makeBulkCreateResponse(['Success'])); await Promise.resolve() })
    expect(onConfirmed).toHaveBeenCalledTimes(1)
  })

  it.each([false, true])('maps results to the nonempty submitted rows with grouping %s', async (createAsParent) => {
    bulkCreate.mockResolvedValue(makeBulkCreateResponse(['Success']))
    render(<BreakdownSuggestion {...props} subHabits={[{ title: ' ' }, { title: 'Dishes', frequencyUnit: 'Day' }]} />)
    if (createAsParent) fireEvent.click(grouping())
    approve()
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Dishes' }).closest('[data-status]')).toHaveAttribute('data-status', 'done')
    expectCompleted()
    expect(document.querySelectorAll('[data-proposed]')).toHaveLength(0)
    expect(screen.queryByText('chat.breakdown.confirmNote')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'chat.breakdown.frequency' })).not.toBeInTheDocument()
  })
})
