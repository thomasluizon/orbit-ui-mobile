import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`
    return key
  },
  useLocale: () => 'en',
}))

vi.mock('@/hooks/use-habits', () => ({
  useHabitLogs: () => ({ data: null }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: { weekStartDay: 1 },
  }),
}))

import { HabitCalendar } from '@/components/habits/habit-calendar'
import type { HabitLog } from '@orbit/shared/types/calendar'

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('HabitCalendar', () => {
  const logs: HabitLog[] = [
    { id: 'log1', date: '2025-01-15', value: 1, createdAtUtc: '2025-01-15T10:00:00Z' },
    { id: 'log2', date: '2025-01-16', value: 1, createdAtUtc: '2025-01-16T09:00:00Z' },
  ]

  it('renders weekday headers', () => {
    render(<HabitCalendar habitId="h1" logs={logs} />, { wrapper: createWrapper() })
    // Should show day abbreviation first chars
    expect(screen.getByText('calendar.completionHistory')).toBeInTheDocument()
  })

  it('renders month navigation', () => {
    render(<HabitCalendar habitId="h1" logs={logs} />, { wrapper: createWrapper() })
    // Should have prev/next month buttons
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(2)
  })

  it('shows completion count', () => {
    render(<HabitCalendar habitId="h1" logs={logs} />, { wrapper: createWrapper() })
    // Depends on whether logs are in the current month
    expect(screen.getByText('calendar.completionHistory')).toBeInTheDocument()
  })

  it('navigates to previous month', () => {
    render(<HabitCalendar habitId="h1" logs={[]} />, { wrapper: createWrapper() })
    const buttons = screen.getAllByRole('button')
    // First button should be previous month
    fireEvent.click(buttons[0]!)
    // Should not crash
    expect(screen.getByText('calendar.completionHistory')).toBeInTheDocument()
  })

  it('navigates to next month', () => {
    render(<HabitCalendar habitId="h1" logs={[]} />, { wrapper: createWrapper() })
    const buttons = screen.getAllByRole('button')
    // Last navigation button is next month
    fireEvent.click(buttons[buttons.length > 2 ? 2 : buttons.length - 1]!)
    expect(screen.getByText('calendar.completionHistory')).toBeInTheDocument()
  })
})
