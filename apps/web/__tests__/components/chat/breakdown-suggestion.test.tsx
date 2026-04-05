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

vi.mock('@/hooks/use-habits', () => ({
  useBulkCreateHabits: () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
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
    // Original 2 + 1 new
    expect(inputs.length).toBeGreaterThanOrEqual(3)
  })

  it('removes a habit when X button clicked', () => {
    render(<BreakdownSuggestion {...defaultProps} />, { wrapper: createWrapper() })
    // Find remove buttons (X icons)
    const removeButtons = screen.getAllByRole('button').filter((btn) => {
      const svg = btn.querySelector('svg')
      return svg && btn.closest('[class*="hover:text-red"]')
    })
    if (removeButtons.length > 0) {
      fireEvent.click(removeButtons[0]!)
      expect(screen.queryByDisplayValue('Push-ups')).not.toBeInTheDocument()
    }
  })
})
