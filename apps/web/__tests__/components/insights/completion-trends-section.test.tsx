import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { useHabitTrendsMock } = vi.hoisted(() => ({ useHabitTrendsMock: vi.fn() }))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/use-habit-trends', () => ({
  useHabitTrends: useHabitTrendsMock,
}))

import { CompletionTrendsSection } from '@/components/insights/completion-trends-section'

const range = { from: '2026-06-01', to: '2026-06-28' }

describe('CompletionTrendsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the loading label while fetching', () => {
    useHabitTrendsMock.mockReturnValue({ data: undefined, isLoading: true, isError: false })

    render(<CompletionTrendsSection range={range} />)

    expect(screen.getByText('insights.loading')).toBeInTheDocument()
  })

  it('shows the error label when the query fails', () => {
    useHabitTrendsMock.mockReturnValue({ data: undefined, isLoading: false, isError: true })

    render(<CompletionTrendsSection range={range} />)

    expect(screen.getByText('insights.error')).toBeInTheDocument()
  })

  it('shows the empty label when nothing was completed in range', () => {
    useHabitTrendsMock.mockReturnValue({
      data: {
        activeHabitCount: 2,
        points: [{ date: '2026-06-01', completedCount: 0, completionRate: 0 }],
      },
      isLoading: false,
      isError: false,
    })

    render(<CompletionTrendsSection range={range} />)

    expect(screen.getByText('insights.empty')).toBeInTheDocument()
  })

  it('renders the trend chart when there is completion data', () => {
    useHabitTrendsMock.mockReturnValue({
      data: {
        activeHabitCount: 2,
        points: [{ date: '2026-06-01', completedCount: 2, completionRate: 100 }],
      },
      isLoading: false,
      isError: false,
    })

    render(<CompletionTrendsSection range={range} />)

    expect(
      screen.getByRole('img', { name: 'insights.sections.completionTrends' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('insights.empty')).toBeNull()
  })
})
