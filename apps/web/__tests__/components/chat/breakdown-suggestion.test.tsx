import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, params?: Record<string, unknown>) => {
      if (params) return `${key}(${JSON.stringify(params)})`
      return key
    }
    t.rich = (key: string, _opts?: unknown) => key
    return t
  },
}))

vi.mock('@/lib/plural', () => ({
  plural: (text: string) => text,
}))

const bulkCreateMock = vi.fn().mockResolvedValue(undefined)

vi.mock('@/hooks/use-habits', () => ({
  useBulkCreateHabits: () => ({
    mutateAsync: bulkCreateMock,
    isPending: false,
  }),
}))

import { BreakdownSuggestion } from '@/components/chat/breakdown-suggestion'
import type { SuggestedSubHabit } from '@orbit/shared/types/chat'

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('BreakdownSuggestion', () => {
  const subHabits: SuggestedSubHabit[] = [
    { title: 'Push-ups', description: '3 sets of 10' },
    { title: 'Squats', description: '3 sets of 15' },
  ]

  const defaultProps = {
    parentName: 'Exercise',
    subHabits,
    onConfirmed: vi.fn(),
    onCancelled: vi.fn(),
  }

  beforeEach(() => {
    defaultProps.onConfirmed.mockClear()
    defaultProps.onCancelled.mockClear()
    bulkCreateMock.mockReset()
    bulkCreateMock.mockResolvedValue(undefined)
  })

  it('renders sub-habits as editable inputs', () => {
    render(<BreakdownSuggestion {...defaultProps} />, { wrapper: createWrapper() })
    const inputs = screen.getAllByDisplayValue('Push-ups')
    expect(inputs.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByDisplayValue('Squats')).toBeInTheDocument()
  })

  it('calls onCancelled when cancel button clicked', () => {
    render(<BreakdownSuggestion {...defaultProps} />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByText('common.cancel'))
    expect(defaultProps.onCancelled).toHaveBeenCalled()
  })

  it('adds a new empty habit when add button clicked', () => {
    render(<BreakdownSuggestion {...defaultProps} />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByText('habits.breakdown.addHabit'))
    const inputs = screen.getAllByRole('textbox')
    expect(inputs.length).toBeGreaterThanOrEqual(3)
  })

  it('removes a habit when its labeled X button is clicked', () => {
    render(<BreakdownSuggestion {...defaultProps} />, { wrapper: createWrapper() })
    const removeButton = screen.getByRole('button', {
      name: /habits\.breakdown\.removeHabit.*Push-ups/,
    })
    fireEvent.click(removeButton)
    expect(screen.queryByDisplayValue('Push-ups')).not.toBeInTheDocument()
  })

  it('shows the friendly i18n fallback instead of a raw Error message on failure', async () => {
    bulkCreateMock.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:5432'))
    render(<BreakdownSuggestion {...defaultProps} />, { wrapper: createWrapper() })

    fireEvent.click(
      screen.getByText('habits.breakdown.createCount({"n":2})'),
    )

    expect(
      await screen.findByText('errors.bulkCreateHabits'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument()
  })

  it('reveals the frequency-quantity editor once a recurrence unit is chosen', () => {
    render(<BreakdownSuggestion {...defaultProps} />, { wrapper: createWrapper() })

    expect(
      screen.queryByLabelText('habits.breakdown.frequencyQuantityLabel'),
    ).not.toBeInTheDocument()

    const [firstUnitSelect] = screen.getAllByRole('combobox')
    fireEvent.change(firstUnitSelect!, { target: { value: 'Week' } })

    expect(
      screen.getByLabelText('habits.breakdown.frequencyQuantityLabel'),
    ).toBeInTheDocument()
  })

  it('passes the chosen frequency quantity into the bulk-create request', async () => {
    render(<BreakdownSuggestion {...defaultProps} />, { wrapper: createWrapper() })

    const [firstUnitSelect] = screen.getAllByRole('combobox')
    fireEvent.change(firstUnitSelect!, { target: { value: 'Week' } })
    fireEvent.change(
      screen.getByLabelText('habits.breakdown.frequencyQuantityLabel'),
      { target: { value: '3' } },
    )
    fireEvent.click(
      screen.getByText('habits.breakdown.createCount({"n":2})'),
    )

    await vi.waitFor(() => expect(bulkCreateMock).toHaveBeenCalled())
    const request = bulkCreateMock.mock.calls[0]![0] as {
      habits: { frequencyUnit?: string; frequencyQuantity?: number }[]
    }
    expect(request.habits[0]).toMatchObject({
      frequencyUnit: 'Week',
      frequencyQuantity: 3,
    })
  })
})
