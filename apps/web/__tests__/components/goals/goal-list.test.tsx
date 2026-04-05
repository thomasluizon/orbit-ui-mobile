import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/use-goals', () => ({
  useReorderGoals: () => ({ mutate: vi.fn() }),
}))

vi.mock('./goal-card', () => ({
  GoalCard: ({ goal }: { goal: { id: string; title: string } }) => (
    <div data-testid={`goal-${goal.id}`}>{goal.title}</div>
  ),
}))

vi.mock('@/components/goals/goal-card', () => ({
  GoalCard: ({ goal }: { goal: { id: string; title: string } }) => (
    <div data-testid={`goal-${goal.id}`}>{goal.title}</div>
  ),
}))

import { GoalList } from '@/components/goals/goal-list'
import type { Goal } from '@orbit/shared/types/goal'

const mockGoals: Goal[] = [
  {
    id: 'g1',
    title: 'Run 100km',
    description: null,
    targetValue: 100,
    currentValue: 50,
    unit: 'km',
    deadline: null,
    status: 'Active',
    progressPercentage: 50,
    createdAtUtc: '2025-01-01T00:00:00Z',
    completedAtUtc: null,
    position: 0,
  },
  {
    id: 'g2',
    title: 'Read 12 books',
    description: null,
    targetValue: 12,
    currentValue: 4,
    unit: 'books',
    deadline: null,
    status: 'Active',
    progressPercentage: 33,
    createdAtUtc: '2025-01-01T00:00:00Z',
    completedAtUtc: null,
    position: 1,
  },
]

describe('GoalList', () => {
  it('renders all goals', () => {
    render(<GoalList goals={mockGoals} />)
    expect(screen.getByTestId('goal-g1')).toBeInTheDocument()
    expect(screen.getByTestId('goal-g2')).toBeInTheDocument()
  })

  it('renders draggable items', () => {
    const { container } = render(<GoalList goals={mockGoals} />)
    const draggables = container.querySelectorAll('[draggable="true"]')
    expect(draggables).toHaveLength(2)
  })
})
