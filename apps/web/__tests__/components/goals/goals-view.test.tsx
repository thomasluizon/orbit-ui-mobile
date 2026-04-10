import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

let mockGoalsData: { allGoals: Array<{ id: string; title: string; status: string }> } | undefined = undefined
let mockIsFetched = false

vi.mock('@/hooks/use-goals', () => ({
  useGoals: () => ({
    data: mockGoalsData,
    isFetched: mockIsFetched,
  }),
}))

vi.mock('@/components/goals/goal-list', () => ({
  GoalList: ({ goals }: { goals: Array<{ id: string; title: string }> }) => (
    <div data-testid="goal-list">{goals.map((g) => <div key={g.id}>{g.title}</div>)}</div>
  ),
}))

import { GoalsView } from '@/components/goals/goals-view'

describe('GoalsView', () => {
  it('renders filter tabs', () => {
    mockGoalsData = { allGoals: [] }
    mockIsFetched = true
    render(<GoalsView />)
    expect(screen.getByText('goals.filters.all')).toBeInTheDocument()
    expect(screen.getByText('goals.filters.active')).toBeInTheDocument()
    expect(screen.getByText('goals.filters.completed')).toBeInTheDocument()
    expect(screen.getByText('goals.filters.abandoned')).toBeInTheDocument()
  })

  it('shows loading skeletons when not fetched', () => {
    mockGoalsData = undefined
    mockIsFetched = false
    const { container } = render(<GoalsView />)
    const skeletons = container.querySelectorAll('.skeleton-shimmer')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows empty state when no goals', () => {
    mockGoalsData = { allGoals: [] }
    mockIsFetched = true
    render(<GoalsView />)
    expect(screen.getByText('goals.empty')).toBeInTheDocument()
    expect(screen.getByText('goals.emptyHint')).toBeInTheDocument()
  })

  it('renders goal list when goals exist', () => {
    mockGoalsData = {
      allGoals: [
        { id: '1', title: 'Goal 1', status: 'Active' },
        { id: '2', title: 'Goal 2', status: 'Completed' },
      ],
    }
    mockIsFetched = true
    render(<GoalsView />)
    expect(screen.getByTestId('goal-list')).toBeInTheDocument()
    expect(screen.getByText('Goal 1')).toBeInTheDocument()
    expect(screen.getByText('Goal 2')).toBeInTheDocument()
  })

  it('filters goals by active status', () => {
    mockGoalsData = {
      allGoals: [
        { id: '1', title: 'Active Goal', status: 'Active' },
        { id: '2', title: 'Done Goal', status: 'Completed' },
      ],
    }
    mockIsFetched = true
    render(<GoalsView />)
    fireEvent.click(screen.getByText('goals.filters.active'))
    expect(screen.getByText('Active Goal')).toBeInTheDocument()
    expect(screen.queryByText('Done Goal')).not.toBeInTheDocument()
  })

  it('filters goals by completed status', () => {
    mockGoalsData = {
      allGoals: [
        { id: '1', title: 'Active Goal', status: 'Active' },
        { id: '2', title: 'Done Goal', status: 'Completed' },
      ],
    }
    mockIsFetched = true
    render(<GoalsView />)
    fireEvent.click(screen.getByText('goals.filters.completed'))
    expect(screen.queryByText('Active Goal')).not.toBeInTheDocument()
    expect(screen.getByText('Done Goal')).toBeInTheDocument()
  })

  it('shows all goals when All filter is selected', () => {
    mockGoalsData = {
      allGoals: [
        { id: '1', title: 'Active Goal', status: 'Active' },
        { id: '2', title: 'Done Goal', status: 'Completed' },
      ],
    }
    mockIsFetched = true
    render(<GoalsView />)
    fireEvent.click(screen.getByText('goals.filters.active'))
    fireEvent.click(screen.getByText('goals.filters.all'))
    expect(screen.getByText('Active Goal')).toBeInTheDocument()
    expect(screen.getByText('Done Goal')).toBeInTheDocument()
  })

  it('highlights active filter tab', () => {
    mockGoalsData = { allGoals: [] }
    mockIsFetched = true
    render(<GoalsView />)
    const allTab = screen.getByText('goals.filters.all')
    expect(allTab.className).toContain('bg-primary')
  })
})
