import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

vi.mock('@/lib/plural', () => ({
  plural: (text: string) => text,
}))

vi.mock('@/components/goals/goal-detail-drawer', () => ({
  GoalDetailDrawer: ({ open }: { open: boolean }) =>
    open ? <div data-testid="goal-detail-drawer" /> : null,
}))

import { GoalCard } from '@/components/goals/goal-card'
import type { Goal } from '@orbit/shared/types/goal'

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: '1',
    title: 'Read 12 books',
    description: null,
    targetValue: 12,
    currentValue: 3,
    unit: 'books',
    status: 'Active',
    deadline: null,
    position: 0,
    createdAtUtc: '2025-01-01T00:00:00Z',
    completedAtUtc: null,
    progressPercentage: 25,
    ...overrides,
  }
}

describe('GoalCard', () => {
  it('renders goal title', () => {
    render(<GoalCard goal={makeGoal()} />)
    expect(screen.getByText('Read 12 books')).toBeInTheDocument()
  })

  it('renders progress bar', () => {
    render(<GoalCard goal={makeGoal({ progressPercentage: 50 })} />)
    const progressbar = screen.getByRole('progressbar')
    expect(progressbar).toBeInTheDocument()
    expect(progressbar).toHaveAttribute('value', '50')
  })

  it('renders progress text', () => {
    render(<GoalCard goal={makeGoal()} />)
    expect(document.body.textContent).toContain('goals.progressOf')
  })

  it('renders percentage', () => {
    render(<GoalCard goal={makeGoal()} />)
    expect(document.body.textContent).toContain('goals.progressPercentage')
  })

  it('shows completed badge for completed goals', () => {
    render(<GoalCard goal={makeGoal({ status: 'Completed' })} />)
    expect(document.body.textContent).toContain('goals.status.completed')
  })

  it('shows abandoned badge for abandoned goals', () => {
    render(<GoalCard goal={makeGoal({ status: 'Abandoned' })} />)
    expect(document.body.textContent).toContain('goals.status.abandoned')
  })

  it('applies line-through for abandoned goals', () => {
    render(<GoalCard goal={makeGoal({ status: 'Abandoned' })} />)
    const title = screen.getByText('Read 12 books')
    expect(title.className).toContain('line-through')
  })

  it('shows deadline info when deadline is set', () => {
    const future = new Date()
    future.setDate(future.getDate() + 5)
    render(<GoalCard goal={makeGoal({ deadline: future.toISOString().split('T')[0] })} />)
    expect(document.body.textContent).toContain('goals.deadline.daysLeft')
  })

  it('shows overdue badge when past deadline', () => {
    render(<GoalCard goal={makeGoal({ deadline: '2020-01-01' })} />)
    expect(document.body.textContent).toContain('goals.deadline.overdue')
  })

  it('applies on_track border class', () => {
    const { container } = render(
      <GoalCard goal={makeGoal({ trackingStatus: 'on_track' })} />,
    )
    const btn = container.querySelector('button')
    expect(btn?.className).toContain('border-l-green-500')
  })

  it('applies at_risk border class', () => {
    const { container } = render(
      <GoalCard goal={makeGoal({ trackingStatus: 'at_risk' })} />,
    )
    const btn = container.querySelector('button')
    expect(btn?.className).toContain('border-l-amber-500')
  })

  it('opens detail drawer on click', () => {
    render(<GoalCard goal={makeGoal()} />)
    fireEvent.click(screen.getByText('Read 12 books'))
    expect(screen.getByTestId('goal-detail-drawer')).toBeInTheDocument()
  })

  it('uses green progress bar for high progress', () => {
    render(<GoalCard goal={makeGoal({ progressPercentage: 80 })} />)
    const bar = document.querySelector('.bg-green-500')
    expect(bar).toBeInTheDocument()
  })

  it('caps progress bar width at 100%', () => {
    render(<GoalCard goal={makeGoal({ progressPercentage: 120 })} />)
    const progressbar = screen.getByRole('progressbar')
    expect(progressbar).toHaveAttribute('value', '100')
  })
})
