import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { BulkCreateRequest, BulkCreateResponse } from '@orbit/shared/types/habit'
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
  ConfirmSheet: ({ open, onConfirm, onCancel, destructive, message }: { open: boolean; onConfirm: () => void; onCancel: () => void; destructive?: boolean; message: string }) =>
    open ? <div role="dialog" aria-label={message}><button type="button" onClick={onConfirm}>{destructive ? 'confirm-remove' : 'confirm-breakdown'}</button><button type="button" onClick={onCancel}>cancel-confirmation</button></div> : null,
}))

let isPending = false
const bulkCreate = vi.fn<(request: BulkCreateRequest) => Promise<BulkCreateResponse>>()

vi.mock('@/hooks/use-habits', () => ({
  useBulkCreateHabits: () => ({ mutateAsync: bulkCreate, isPending }),
}))

const defaultProps = {
  parentName: 'House routine',
  subHabits,
  onConfirmed: vi.fn(),
  onCancelled: vi.fn(),
}

beforeEach(() => {
  isPending = false
  bulkCreate.mockReset()
  defaultProps.onConfirmed.mockReset()
})

it('confirms removal of a named proposal and submits only the retained row', async () => {
  bulkCreate.mockResolvedValue(makeBulkCreateResponse(['Success']))
  render(<BreakdownSuggestion {...defaultProps} />)
  fireEvent.click(screen.getByRole('button', { name: /habits\.breakdown\.removeHabit.*Dishes/ }))
  expect(screen.getByRole('dialog')).toHaveAccessibleName(/chat\.breakdown\.removeBody.*Dishes/)
  expect(screen.getByRole('button', { name: 'Dishes' })).toBeInTheDocument()
  expect(bulkCreate).not.toHaveBeenCalled()
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'cancel-confirmation' }))
  expect(screen.getByRole('button', { name: 'Dishes' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /habits\.breakdown\.removeHabit.*Dishes/ }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'confirm-remove' }))
  expect(screen.queryByRole('button', { name: 'Dishes' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'chat.preview.reject' })).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Laundry' })).toBeInTheDocument()
  expect(bulkCreate).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'chat.preview.approve' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'confirm-breakdown' }))
  await waitFor(() => expect(defaultProps.onConfirmed).toHaveBeenCalledTimes(1))
  expect(bulkCreate.mock.calls[0]?.[0]).toEqual({ habits: [expect.objectContaining({ title: 'Laundry', frequencyUnit: 'Week' })] })
  expect(screen.queryByRole('button', { name: /habits\.breakdown\.removeHabit/ })).not.toBeInTheDocument()
})

it('disables approval when every proposed row has been removed', () => {
  render(<BreakdownSuggestion {...defaultProps} />)
  for (const name of ['Dishes', 'Laundry']) {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`habits\\.breakdown\\.removeHabit.*${name}`) }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'confirm-remove' }))
  }
  expect(screen.getByText('chat.breakdown.empty')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'chat.preview.edit' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'chat.preview.reject' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'chat.preview.approve' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'chat.preview.approve' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(bulkCreate).not.toHaveBeenCalled()
})

it('disables proposal removal while creation is pending', () => {
  isPending = true
  render(<BreakdownSuggestion {...defaultProps} />)
  const remove = screen.getByRole('button', { name: /habits\.breakdown\.removeHabit.*Dishes/ })
  expect(remove).toBeDisabled()
  fireEvent.click(remove)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('keeps a removed row out of the error recovery request', async () => {
  bulkCreate.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(makeBulkCreateResponse(['Success']))
  render(<BreakdownSuggestion {...defaultProps} />)
  fireEvent.click(screen.getByRole('button', { name: /habits\.breakdown\.removeHabit.*Dishes/ }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'confirm-remove' }))
  fireEvent.click(screen.getByRole('button', { name: 'chat.preview.approve' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'confirm-breakdown' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('habits.breakdown.createError'))
  expect(defaultProps.onConfirmed).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: /habits\.breakdown\.removeHabit.*Dishes/ })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /habits\.breakdown\.removeHabit.*Laundry/ })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'chat.preview.approve' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'confirm-breakdown' }))
  await waitFor(() => expect(defaultProps.onConfirmed).toHaveBeenCalledTimes(1))
  expect(bulkCreate).toHaveBeenCalledTimes(2)
  for (const [request] of bulkCreate.mock.calls) expect(request).toEqual({ habits: [expect.objectContaining({ title: 'Laundry' })] })
})

describe('BreakdownSuggestion', () => {

  it('withholds the batch until the approval sheet is confirmed', async () => {
    bulkCreate.mockResolvedValue(makeBulkCreateResponse(['Success', 'Success']))
    render(<BreakdownSuggestion {...defaultProps} />)

    expect(bulkCreate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'chat.preview.approve' }))
    expect(bulkCreate).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'confirm-breakdown' }))

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
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'confirm-breakdown' }))
    const retry = await screen.findByRole('button', { name: /chat\.batch\.retry/ })
    fireEvent.click(retry)

    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(2))
    expect(bulkCreate.mock.calls[1]?.[0]).toMatchObject({ habits: [{ title: 'Laundry' }] })
  })
  it.each(['UnbrokenToken'.repeat(24), 'Read extraordinarilyLongWord daily before breakfast with the people in my neighborhood'])('discloses the full parent heading %s', (name) => {
    const title = `chat.breakdown.title(${JSON.stringify({ name })})`
    render(<BreakdownSuggestion {...defaultProps} parentName={name} />)
    const heading = screen.getByRole('heading', { name: title, level: 3 })
    expect(heading.querySelector('[data-personal-text]')).toHaveAttribute('aria-label', title)
    fireEvent.click(screen.getByRole('button', { name: `common.showFullText(${JSON.stringify({ name: title })})`, expanded: false }))
    expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument()
    expect(bulkCreate).not.toHaveBeenCalled()
  })
})

it('keeps complete successful proposal names reachable without editing', async () => {
  const title = 'Ler ' + 'palavralonga'.repeat(12) + ' todos os dias'
  bulkCreate.mockResolvedValue(makeBulkCreateResponse(['Success']))
  render(<BreakdownSuggestion {...defaultProps} subHabits={[{ title, frequencyUnit: 'Day' }]} />)
  expect(screen.getByRole('button', { name: title })).toHaveStyle({ color: 'var(--fg-3)' })
  fireEvent.click(screen.getByRole('button', { name: 'chat.preview.approve' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'confirm-breakdown' }))
  await waitFor(() => expect(screen.getByRole('button', { name: title }).closest('[data-status]')).toHaveAttribute('data-status', 'done'))
  expect(defaultProps.onConfirmed).toHaveBeenCalledTimes(1)
  const disclosure = screen.getByRole('button', { name: title })
  expect(disclosure).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(disclosure)
  expect(disclosure).toHaveAttribute('aria-expanded', 'true')
  expect(disclosure.parentElement).toHaveTextContent(title)


})


it('adds and focuses an editable one-time row, then approves it in the same batch', async () => {
  bulkCreate.mockResolvedValue(makeBulkCreateResponse(['Success', 'Success', 'Success']))
  render(<BreakdownSuggestion {...defaultProps} />)
  fireEvent.click(screen.getByRole('button', { name: 'habits.breakdown.addHabit' }))
  const input = screen.getByRole('textbox')
  expect(input).toHaveFocus()
  expect(input).toHaveValue('')
  const cadence = screen.getAllByRole('button', { name: /chat\.breakdown\.frequency/ }).at(-1)!
  expect(cadence).toHaveTextContent('habits.filter.oneTime')
  fireEvent.change(input, { target: { value: '  Sweep  ' } })
  fireEvent.click(cadence)
  fireEvent.click(cadence)
  fireEvent.blur(input)
  expect(screen.getByRole('button', { name: 'Sweep' }).closest('[data-proposed]')).toBeNull()
  expect(screen.getByRole('button', { name: 'Dishes' }).closest('[data-proposed]')).not.toBeNull()
  expect(bulkCreate).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'chat.preview.approve' }))
  expect(bulkCreate).not.toHaveBeenCalled()
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'confirm-breakdown' }))
  await waitFor(() => expect(defaultProps.onConfirmed).toHaveBeenCalledTimes(1))
  expect(bulkCreate).toHaveBeenCalledTimes(1)
  expect(bulkCreate.mock.calls[0]?.[0]).toMatchObject({ habits: [
    { title: 'Dishes', frequencyUnit: 'Day' },
    { title: 'Laundry', frequencyUnit: 'Week' },
    { title: 'Sweep', frequencyUnit: 'Week', frequencyQuantity: 1 },
  ] })
  expect(screen.queryByRole('button', { name: 'habits.breakdown.addHabit' })).not.toBeInTheDocument()
})

it('keeps multiple added drafts distinct and ignores blanks when mapping failures and retries', async () => {
  bulkCreate
    .mockResolvedValueOnce(makeBulkCreateResponse(['Success', 'Success', 'Failed']))
    .mockResolvedValueOnce(makeBulkCreateResponse(['Success']))
  render(<BreakdownSuggestion {...defaultProps} />)
  fireEvent.click(screen.getByRole('button', { name: 'habits.breakdown.addHabit' }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } })
  fireEvent.blur(screen.getByRole('textbox'))
  fireEvent.click(screen.getByRole('button', { name: 'habits.breakdown.addHabit' }))
  const inputs = screen.getAllByRole('textbox')
  expect(inputs).toHaveLength(2)
  fireEvent.change(inputs[1]!, { target: { value: 'Sweep' } })
  fireEvent.blur(inputs[1]!)
  fireEvent.click(screen.getByRole('button', { name: 'chat.preview.approve' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'confirm-breakdown' }))
  const retry = await screen.findByRole('button', { name: /chat\.batch\.retry/ })
  expect(screen.getByRole('button', { name: 'Sweep' }).closest('[data-status]')).toHaveAttribute('data-status', 'failed')
  expect(defaultProps.onConfirmed).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'habits.breakdown.addHabit' })).not.toBeInTheDocument()
  fireEvent.click(retry)
  await waitFor(() => expect(defaultProps.onConfirmed).toHaveBeenCalledTimes(1))
  expect(bulkCreate.mock.calls[1]?.[0]).toMatchObject({ habits: [{ title: 'Sweep' }] })
})

it('keeps a rejected batch editable until it fits a persistent capacity constraint', async () => {
  bulkCreate.mockImplementation((request) => {
    if (request.habits.length > 2) return Promise.reject(new Error('habit capacity'))
    return Promise.resolve(makeBulkCreateResponse(request.habits.map(() => 'Success')))
  })
  render(<BreakdownSuggestion {...defaultProps} />)
  fireEvent.click(screen.getByRole('button', { name: 'habits.breakdown.addHabit' }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Sweep' } })
  fireEvent.blur(screen.getByRole('textbox'))
  for (let attempt = 1; attempt <= 2; attempt++) {
    fireEvent.click(screen.getByRole('button', { name: 'chat.preview.approve' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'confirm-breakdown' }))
    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(attempt))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('habits.breakdown.createError'))
    expect(screen.getByRole('button', { name: 'chat.preview.reject' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /chat\.batch\.retry/ })).not.toBeInTheDocument()
    expect(defaultProps.onConfirmed).not.toHaveBeenCalled()
  }
  fireEvent.click(screen.getAllByRole('button', { name: 'chat.preview.editItem' })[0]!)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Kitchen dishes' } })
  fireEvent.blur(screen.getByRole('textbox'))
  fireEvent.click(screen.getByRole('button', { name: /habits\.breakdown\.removeHabit.*Sweep/ }))
  expect(screen.getByRole('dialog')).toHaveAccessibleName(/chat\.breakdown\.removeBody/)
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'confirm-remove' }))
  fireEvent.click(screen.getByRole('button', { name: /chat\.breakdown\.frequency.*Kitchen dishes/ }))
  fireEvent.click(screen.getByRole('button', { name: 'chat.preview.approve' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'confirm-breakdown' }))
  await waitFor(() => expect(defaultProps.onConfirmed).toHaveBeenCalledTimes(1))
  expect(bulkCreate.mock.calls[2]?.[0].habits).toMatchObject([
    { title: 'Kitchen dishes', frequencyUnit: 'Week' }, { title: 'Laundry' },
  ])
})

it('stops adding at 100 rows and allows adding again after removal', () => {
  render(<BreakdownSuggestion {...defaultProps} subHabits={Array.from({ length: 99 }, (_, index) => ({ title: `Habit ${index}` }))} />)
  const add = screen.getByRole('button', { name: 'habits.breakdown.addHabit' })
  fireEvent.click(add)
  expect(add).toBeDisabled()
  expect(screen.getByText(/habits\.breakdown\.limit/)).toHaveAttribute('role', 'status')
  fireEvent.click(add)
  expect(screen.getAllByRole('textbox')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: /habits\.breakdown\.removeHabit.*Habit 0/ }))
  expect(screen.getByRole('dialog')).toHaveAccessibleName(/chat\.breakdown\.removeBody/)
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'confirm-remove' }))
  expect(add).toBeEnabled()
  expect(screen.queryByText(/habits\.breakdown\.limit/)).not.toBeInTheDocument()
})

it('never submits an oversized incoming proposal until it is reduced', async () => {
  bulkCreate.mockImplementation((request) => {
    if (request.habits.length > 100) return Promise.reject(new Error('batch size'))
    return Promise.resolve(makeBulkCreateResponse(request.habits.map(() => 'Success')))
  })
  render(<BreakdownSuggestion {...defaultProps} subHabits={Array.from({ length: 101 }, (_, index) => ({ title: `Habit ${index}` }))} />)
  fireEvent.click(screen.getByRole('button', { name: 'chat.preview.approve' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'confirm-breakdown' }))
  expect(bulkCreate).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /habits\.breakdown\.removeHabit.*Habit 0/ }))
  expect(screen.getByRole('dialog')).toHaveAccessibleName(/chat\.breakdown\.removeBody/)
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'confirm-remove' }))
  fireEvent.click(screen.getByRole('button', { name: 'chat.preview.approve' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'confirm-breakdown' }))
  await waitFor(() => expect(defaultProps.onConfirmed).toHaveBeenCalledTimes(1))
  expect(bulkCreate.mock.calls[0]?.[0].habits).toHaveLength(100)
})

it('keeps an all-failed response editable and rejectable', async () => {
  bulkCreate.mockResolvedValue(makeBulkCreateResponse(['Failed', 'Failed']))
  render(<BreakdownSuggestion {...defaultProps} />)
  fireEvent.click(screen.getByRole('button', { name: 'chat.preview.approve' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'confirm-breakdown' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('habits.breakdown.createError'))
  fireEvent.click(screen.getByRole('button', { name: 'chat.preview.reject' }))
  expect(screen.getByRole('status')).toHaveTextContent('chat.preview.rejected')
})

it('preserves successful rows when retry requests keep failing', async () => {
  bulkCreate.mockImplementation((request) => request.habits.length === 2
    ? Promise.resolve(makeBulkCreateResponse(['Success', 'Failed']))
    : Promise.reject(new Error('unavailable')))
  render(<BreakdownSuggestion {...defaultProps} />)
  fireEvent.click(screen.getByRole('button', { name: 'chat.preview.approve' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'confirm-breakdown' }))
  const retry = await screen.findByRole('button', { name: /chat\.batch\.retry/ })
  for (let attempt = 2; attempt <= 3; attempt++) {
    fireEvent.click(retry)
    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(attempt))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('habits.breakdown.retryError'))
    expect(screen.getByRole('button', { name: 'Dishes' }).closest('[data-status]')).toHaveAttribute('data-status', 'done')
    expect(bulkCreate.mock.calls[attempt - 1]?.[0].habits).toMatchObject([{ title: 'Laundry' }])
  }
  expect(defaultProps.onConfirmed).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'chat.preview.reject' })).not.toBeInTheDocument()
})

it('disables adding while the batch is pending', () => {
  isPending = true
  render(<BreakdownSuggestion {...defaultProps} />)
  const add = screen.getByRole('button', { name: 'habits.breakdown.addHabit' })
  expect(add).toBeDisabled()
  fireEvent.click(add)
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(bulkCreate).not.toHaveBeenCalled()
})

it('does not send blank-only drafts and can add to an empty proposal', async () => {
  render(<BreakdownSuggestion {...defaultProps} subHabits={[]} />)
  fireEvent.click(screen.getByRole('button', { name: 'habits.breakdown.addHabit' }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } })
  fireEvent.click(screen.getByRole('button', { name: 'chat.preview.approve' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'confirm-breakdown' }))
  await waitFor(() => expect(bulkCreate).not.toHaveBeenCalled())
  expect(defaultProps.onConfirmed).not.toHaveBeenCalled()
})


it('keeps a blank added row editable when it is focused again', () => {
  render(<BreakdownSuggestion {...defaultProps} />)
  fireEvent.click(screen.getByRole('button', { name: 'habits.breakdown.addHabit' }))
  const input = screen.getByRole('textbox')
  fireEvent.blur(input)
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: 'Sweep' } })
  expect(screen.getByRole('textbox')).toHaveValue('Sweep')
})

it('names and confirms removal of a whitespace-only added draft', () => {
  render(<BreakdownSuggestion {...defaultProps} />)
  fireEvent.click(screen.getByRole('button', { name: 'habits.breakdown.addHabit' }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } })
  fireEvent.blur(screen.getByRole('textbox'))
  const remove = screen.getAllByRole('button', { name: /habits\.breakdown\.removeHabit/ }).at(-1)!
  expect(remove).toHaveAccessibleName('habits.breakdown.removeHabit({"name":"chat.breakdown.unnamedHabit"})')
  fireEvent.click(remove)
  expect(screen.getByRole('dialog')).toHaveAccessibleName('chat.breakdown.removeBody({"name":"chat.breakdown.unnamedHabit"})')
  expect(screen.getByRole('textbox')).toHaveValue('   ')
  expect(bulkCreate).not.toHaveBeenCalled()
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'confirm-remove' }))
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Dishes' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Laundry' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'habits.breakdown.addHabit' })).toBeEnabled()
  expect(bulkCreate).not.toHaveBeenCalled()
})
