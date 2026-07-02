import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Goal } from '@orbit/shared/types/goal'

vi.mock('next-intl', () => ({
  useTranslations:
    () =>
    (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  useLocale: () => 'en',
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

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

interface ProgressEntry {
  value: number
  previousValue: number
  note: string | null
  createdAtUtc: string
}

interface DetailData {
  goal: Goal & { progressHistory: ProgressEntry[] }
  metrics: null
}

let detailData: DetailData | undefined
let detailLoading = false

vi.mock('@/hooks/use-goals', () => ({
  useGoals: () => ({
    data: {
      allGoals: detailData ? [detailData.goal] : [],
      goalsById: new Map(detailData ? [[detailData.goal.id, detailData.goal]] : []),
    },
  }),
  useGoalDetail: (id: string | null) => ({
    data: id ? detailData : undefined,
    isLoading: detailLoading,
  }),
}))

vi.mock('@/components/goals/goal-metrics-panel', () => ({
  GoalMetricsPanel: () => <div data-testid="metrics-panel" />,
}))

vi.mock('@/components/goals/goal-detail-drawer', () => ({
  GoalDetailDrawer: ({
    open,
    initialAction,
  }: {
    open: boolean
    initialAction?: string | null
  }) =>
    open ? (
      <div data-testid="goal-detail-drawer" data-initial-action={initialAction ?? ''} />
    ) : null,
}))

import { GoalDetailPanel } from '@/components/goals/goal-detail-panel'

describe('GoalDetailPanel', () => {
  beforeEach(() => {
    detailData = { goal: { ...makeGoal(), progressHistory: [] }, metrics: null }
    detailLoading = false
  })

  it('renders nothing when no goal is selected', () => {
    const { container } = render(<GoalDetailPanel goalId={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders the selected goal title', () => {
    render(<GoalDetailPanel goalId="1" />)
    expect(screen.getByText('Read 12 books')).toBeInTheDocument()
  })

  it('renders the progress summary', () => {
    render(<GoalDetailPanel goalId="1" />)
    expect(document.body.textContent).toContain('goals.progressOf')
  })

  it('renders the metrics panel for active goals', () => {
    render(<GoalDetailPanel goalId="1" />)
    expect(screen.getByTestId('metrics-panel')).toBeInTheDocument()
  })

  it('opens the drawer straight into the progress form from the update-progress action', () => {
    render(<GoalDetailPanel goalId="1" />)
    expect(screen.queryByTestId('goal-detail-drawer')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('goals.updateProgress'))
    expect(screen.getByTestId('goal-detail-drawer')).toHaveAttribute(
      'data-initial-action',
      'progress',
    )
  })

  it('offers an edit action and hides metrics for non-active goals', () => {
    detailData = {
      goal: { ...makeGoal({ status: 'Completed' }), progressHistory: [] },
      metrics: null,
    }
    render(<GoalDetailPanel goalId="1" />)
    expect(screen.getByText('goals.detail.edit')).toBeInTheDocument()
    expect(screen.queryByTestId('metrics-panel')).not.toBeInTheDocument()
  })

  it('opens the drawer straight into the edit modal for non-active goals', () => {
    detailData = {
      goal: { ...makeGoal({ status: 'Completed' }), progressHistory: [] },
      metrics: null,
    }
    render(<GoalDetailPanel goalId="1" />)
    fireEvent.click(screen.getByText('goals.detail.edit'))
    expect(screen.getByTestId('goal-detail-drawer')).toHaveAttribute(
      'data-initial-action',
      'edit',
    )
  })

  it('renders the Ask-Astra prompt row', () => {
    render(<GoalDetailPanel goalId="1" />)
    expect(
      screen.getByRole('button', {
        name: 'goals.detail.askAstraEyebrow: goals.detail.askAstraDefault',
      }),
    ).toBeInTheDocument()
  })

  it('renders a progress trend when history has multiple points', () => {
    detailData = {
      goal: {
        ...makeGoal(),
        progressHistory: [
          { value: 2, previousValue: 0, note: null, createdAtUtc: '2025-01-02T00:00:00Z' },
          { value: 5, previousValue: 2, note: null, createdAtUtc: '2025-01-05T00:00:00Z' },
        ],
      },
      metrics: null,
    }
    render(<GoalDetailPanel goalId="1" />)
    expect(screen.getByRole('img', { name: 'goals.progress' })).toBeInTheDocument()
  })
})
