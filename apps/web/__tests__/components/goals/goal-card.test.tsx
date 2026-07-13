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
    linkedHabits: [],
    ...overrides,
  }
}

function renderCard(goal: Goal, onOpenDetail = vi.fn()) {
  render(<GoalCard goal={goal} onOpenDetail={onOpenDetail} />)
  return onOpenDetail
}

describe('GoalCard', () => {
  it('renders goal title', () => {
    renderCard(makeGoal())
    expect(screen.getByText('Read 12 books')).toBeInTheDocument()
  })

  it('renders progress bar', () => {
    renderCard(makeGoal({ progressPercentage: 50 }))
    const progressbar = screen.getByRole('progressbar')
    expect(progressbar).toBeInTheDocument()
    expect(progressbar).toHaveAttribute('aria-valuenow', '50')
  })

  it('renders progress text', () => {
    renderCard(makeGoal())
    expect(document.body.textContent).toContain('goals.progressOf')
  })

  it('renders percentage', () => {
    renderCard(makeGoal())
    expect(document.body.textContent).toContain('25%')
  })

  it('announces a rounded percentage to assistive tech', () => {
    renderCard(makeGoal({ progressPercentage: 66.66666 }))
    expect(
      screen.getByRole('progressbar', { name: 'goals.progressPercentage:{"pct":67}' }),
    ).toBeInTheDocument()
  })

  it('shows completed badge for completed goals', () => {
    renderCard(makeGoal({ status: 'Completed' }))
    expect(document.body.textContent).toContain('goals.status.completed')
  })

  it('shows abandoned badge for abandoned goals', () => {
    renderCard(makeGoal({ status: 'Abandoned' }))
    expect(document.body.textContent).toContain('goals.status.abandoned')
  })

  it('applies line-through for abandoned goals', () => {
    renderCard(makeGoal({ status: 'Abandoned' }))
    const title = screen.getByText('Read 12 books')
    expect(title.className).toContain('line-through')
  })

  it('shows deadline info when deadline is set', () => {
    const future = new Date()
    future.setDate(future.getDate() + 5)
    renderCard(makeGoal({ deadline: future.toISOString().split('T')[0] }))
    expect(document.body.textContent).toContain('goals.deadline.daysLeft')
  })

  it('shows overdue badge when past deadline', () => {
    renderCard(makeGoal({ deadline: '2020-01-01' }))
    expect(document.body.textContent).toContain('goals.deadline.overdue')
  })

  it('shows due-today badge when the deadline is today', () => {
    const withinToday = new Date(Date.now() + 60_000).toISOString()
    renderCard(makeGoal({ deadline: withinToday }))
    expect(document.body.textContent).toContain('goals.deadline.dueToday')
  })

  it('shows on_track tracking dot', () => {
    renderCard(makeGoal({ trackingStatus: 'on_track' }))
    expect(screen.getByLabelText('goals.metrics.onTrack')).toBeInTheDocument()
  })

  it('shows at_risk tracking dot', () => {
    renderCard(makeGoal({ trackingStatus: 'at_risk' }))
    expect(screen.getByLabelText('goals.metrics.atRisk')).toBeInTheDocument()
  })

  it('requests the detail drawer on click', () => {
    const onOpenDetail = renderCard(makeGoal())
    fireEvent.click(screen.getByText('Read 12 books'))
    expect(onOpenDetail).toHaveBeenCalledWith('1', null)
  })

  it('marks high progress with the completion state', () => {
    renderCard(makeGoal({ progressPercentage: 80 }))
    const bar = document.querySelector('[data-progress-state="high"]')
    expect(bar).toBeInTheDocument()
  })

  it('caps progress bar width at 100%', () => {
    renderCard(makeGoal({ progressPercentage: 120 }))
    const progressbar = screen.getByRole('progressbar')
    expect(progressbar).toHaveAttribute('aria-valuenow', '100')
  })

  it('caps the announced percentage at 100 for overflowing progress', () => {
    renderCard(makeGoal({ progressPercentage: 120 }))
    expect(
      screen.getByRole('progressbar', { name: 'goals.progressPercentage:{"pct":100}' }),
    ).toBeInTheDocument()
  })
})
