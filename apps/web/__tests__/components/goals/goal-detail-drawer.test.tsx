import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
  useLocale: () => 'en',
}))

vi.mock('dompurify', () => ({
  default: { sanitize: (html: string) => html },
}))

const listGoal = {
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
}

let detailGoal = { ...listGoal, progressHistory: [] as Array<unknown> }

vi.mock('@/hooks/use-goals', () => ({
  useGoals: () => ({
    data: {
      allGoals: [listGoal],
      goalsById: new Map([['1', listGoal]]),
    },
  }),
  useGoalDetail: (id: string | null) => ({
    data: id ? { goal: detailGoal, metrics: null } : null,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUpdateGoalProgress: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useUpdateGoalStatus: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useDeleteGoal: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
}))

vi.mock('@/components/goals/edit-goal-modal', () => ({
  EditGoalModal: () => null,
}))

vi.mock('@/components/goals/goal-metrics-panel', () => ({
  GoalMetricsPanel: () => React.createElement('div', { 'data-testid': 'metrics-panel' }),
}))

import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'

describe('GoalDetailDrawer', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    detailGoal = { ...listGoal, progressHistory: [] }
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <GoalDetailDrawer open={false} onOpenChange={vi.fn()} goalId="1" />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders goal title when open', () => {
    render(
      <GoalDetailDrawer open={true} onOpenChange={vi.fn()} goalId="1" />,
    )
    expect(screen.getByText('Read 12 books')).toBeInTheDocument()
  })

  it('renders progress section', () => {
    render(
      <GoalDetailDrawer open={true} onOpenChange={vi.fn()} goalId="1" />,
    )
    expect(document.body.textContent).toContain('goals.progress')
  })

  it('renders progress info text', () => {
    render(
      <GoalDetailDrawer open={true} onOpenChange={vi.fn()} goalId="1" />,
    )
    expect(document.body.textContent).toContain('goals.progressOf')
  })

  it('renders update progress button for active goals', () => {
    render(
      <GoalDetailDrawer open={true} onOpenChange={vi.fn()} goalId="1" />,
    )
    expect(document.body.textContent).toContain('goals.updateProgress')
  })

  it('renders edit action', () => {
    render(
      <GoalDetailDrawer open={true} onOpenChange={vi.fn()} goalId="1" />,
    )
    expect(document.body.textContent).toContain('goals.detail.edit')
  })

  it('renders mark completed action for active goals', () => {
    render(
      <GoalDetailDrawer open={true} onOpenChange={vi.fn()} goalId="1" />,
    )
    expect(document.body.textContent).toContain('goals.detail.markCompleted')
  })

  it('renders mark abandoned action for active goals', () => {
    render(
      <GoalDetailDrawer open={true} onOpenChange={vi.fn()} goalId="1" />,
    )
    expect(document.body.textContent).toContain('goals.detail.markAbandoned')
  })

  it('renders delete action', () => {
    render(
      <GoalDetailDrawer open={true} onOpenChange={vi.fn()} goalId="1" />,
    )
    expect(document.body.textContent).toContain('goals.detail.delete')
  })

  it('renders metrics panel for active goals', () => {
    render(
      <GoalDetailDrawer open={true} onOpenChange={vi.fn()} goalId="1" />,
    )
    expect(screen.getByTestId('metrics-panel')).toBeInTheDocument()
  })

  it('prefers synced detail data over the stale list cache', () => {
    detailGoal = {
      ...listGoal,
      title: 'Read 12 books (synced)',
      currentValue: 6,
      progressPercentage: 50,
      progressHistory: [],
    }

    render(
      <GoalDetailDrawer open={true} onOpenChange={vi.fn()} goalId="1" />,
    )

    expect(screen.getByText('Read 12 books (synced)')).toBeInTheDocument()
    expect(document.body.textContent).toContain('"current":6')
  })
})
