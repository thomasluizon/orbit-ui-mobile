import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { useGoalsMock, useGoalProgressHistoryMock } = vi.hoisted(() => ({
  useGoalsMock: vi.fn(),
  useGoalProgressHistoryMock: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

vi.mock('@/hooks/use-goals', () => ({ useGoals: useGoalsMock }))
vi.mock('@/hooks/use-goal-progress-history', () => ({
  useGoalProgressHistory: useGoalProgressHistoryMock,
}))

import { GoalProgressSection } from '@/components/insights/goal-progress-section'

const range = { from: '2026-06-01', to: '2026-06-28' }

describe('GoalProgressSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useGoalProgressHistoryMock.mockReturnValue({ data: undefined, isLoading: false, isError: false })
  })

  it('shows the no-goals empty label and no picker when there are no goals', () => {
    useGoalsMock.mockReturnValue({ data: { allGoals: [] }, isLoading: false })

    render(<GoalProgressSection range={range} />)

    expect(screen.getByText('insights.sections.noGoals')).toBeInTheDocument()
    expect(screen.queryByLabelText('insights.sections.selectGoal')).toBeNull()
  })

  it('renders the goal picker and chart when a goal has progress', () => {
    useGoalsMock.mockReturnValue({
      data: { allGoals: [{ id: 'g1', title: 'Run a marathon' }] },
      isLoading: false,
    })
    useGoalProgressHistoryMock.mockReturnValue({
      data: {
        goalId: 'g1',
        points: [{ date: '2026-06-01', value: 5, previousValue: 0, note: null }],
      },
      isLoading: false,
      isError: false,
    })

    render(<GoalProgressSection range={range} />)

    expect(screen.getByLabelText('insights.sections.selectGoal')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Run a marathon' })).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'insights.sections.goalProgress' }),
    ).toBeInTheDocument()
  })
})
