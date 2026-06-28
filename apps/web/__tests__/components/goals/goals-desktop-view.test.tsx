import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Goal } from '@orbit/shared/types/goal'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

interface MockGoalListProps {
  goals: Goal[]
  selectedId?: string | null
  onSelect?: (goalId: string) => void
}

vi.mock('@/components/goals/goal-list', () => ({
  GoalList: ({ goals, selectedId, onSelect }: MockGoalListProps) => (
    <div data-testid="goal-list" data-selected={selectedId ?? ''}>
      {goals.map((goal) => (
        <button
          key={goal.id}
          type="button"
          data-testid={`pick-${goal.id}`}
          onClick={() => onSelect?.(goal.id)}
        >
          {goal.title}
        </button>
      ))}
    </div>
  ),
}))

vi.mock('@/components/goals/goal-detail-panel', () => ({
  GoalDetailPanel: ({ goalId }: { goalId: string | null }) => (
    <div data-testid="detail-panel">{goalId ?? 'none'}</div>
  ),
}))

import { GoalsDesktopView } from '@/components/goals/goals-desktop-view'

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: '1',
    title: 'Goal',
    description: null,
    targetValue: 10,
    currentValue: 1,
    unit: 'x',
    status: 'Active',
    deadline: null,
    position: 0,
    createdAtUtc: '2025-01-01T00:00:00Z',
    completedAtUtc: null,
    progressPercentage: 10,
    ...overrides,
  }
}

const goals = [
  makeGoal({ id: 'g1', title: 'Goal One' }),
  makeGoal({ id: 'g2', title: 'Goal Two', position: 1 }),
]

describe('GoalsDesktopView', () => {
  it('shows skeletons before goals are fetched', () => {
    const { container } = render(<GoalsDesktopView goals={[]} isFetched={false} />)
    expect(container.querySelectorAll('.skeleton-pulse').length).toBeGreaterThan(0)
  })

  it('shows the empty state when fetched with no goals', () => {
    render(<GoalsDesktopView goals={[]} isFetched />)
    expect(screen.getByText('goals.empty')).toBeInTheDocument()
    expect(screen.getByText('goals.emptyHint')).toBeInTheDocument()
  })

  it('renders both panes and auto-selects the first goal', () => {
    render(<GoalsDesktopView goals={goals} isFetched />)
    expect(screen.getByTestId('goal-list')).toBeInTheDocument()
    expect(screen.getByTestId('detail-panel')).toHaveTextContent('g1')
  })

  it('shows the chosen goal in the detail panel when selected', () => {
    render(<GoalsDesktopView goals={goals} isFetched />)
    fireEvent.click(screen.getByTestId('pick-g2'))
    expect(screen.getByTestId('detail-panel')).toHaveTextContent('g2')
  })

  it('keeps the selected id in sync with the list', () => {
    render(<GoalsDesktopView goals={goals} isFetched />)
    expect(screen.getByTestId('goal-list')).toHaveAttribute('data-selected', 'g1')
    fireEvent.click(screen.getByTestId('pick-g2'))
    expect(screen.getByTestId('goal-list')).toHaveAttribute('data-selected', 'g2')
  })
})
