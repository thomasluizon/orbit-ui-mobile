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

function openFilterMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'goals.filters.statusFilter' }))
}

describe('GoalsView', () => {
  it('renders the status filter trigger', () => {
    mockGoalsData = { allGoals: [] }
    mockIsFetched = true
    render(<GoalsView />)
    expect(
      screen.getByRole('button', { name: 'goals.filters.statusFilter' }),
    ).toBeInTheDocument()
  })

  it('shows loading skeletons when not fetched', () => {
    mockGoalsData = undefined
    mockIsFetched = false
    const { container } = render(<GoalsView />)
    const skeletons = container.querySelectorAll('.skeleton-pulse')
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

  it('filters goals by active status from the menu', () => {
    mockGoalsData = {
      allGoals: [
        { id: '1', title: 'Active Goal', status: 'Active' },
        { id: '2', title: 'Done Goal', status: 'Completed' },
      ],
    }
    mockIsFetched = true
    render(<GoalsView />)
    openFilterMenu()
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'goals.filters.active' }))
    expect(screen.getByText('Active Goal')).toBeInTheDocument()
    expect(screen.queryByText('Done Goal')).not.toBeInTheDocument()
  })

  it('filters goals by completed status from the menu', () => {
    mockGoalsData = {
      allGoals: [
        { id: '1', title: 'Active Goal', status: 'Active' },
        { id: '2', title: 'Done Goal', status: 'Completed' },
      ],
    }
    mockIsFetched = true
    render(<GoalsView />)
    openFilterMenu()
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'goals.filters.completed' }))
    expect(screen.queryByText('Active Goal')).not.toBeInTheDocument()
    expect(screen.getByText('Done Goal')).toBeInTheDocument()
  })

  it('shows all goals when All filter is reselected', () => {
    mockGoalsData = {
      allGoals: [
        { id: '1', title: 'Active Goal', status: 'Active' },
        { id: '2', title: 'Done Goal', status: 'Completed' },
      ],
    }
    mockIsFetched = true
    render(<GoalsView />)
    openFilterMenu()
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'goals.filters.active' }))
    openFilterMenu()
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'goals.filters.all' }))
    expect(screen.getByText('Active Goal')).toBeInTheDocument()
    expect(screen.getByText('Done Goal')).toBeInTheDocument()
  })

  it('marks the trigger as pressed when a filter is active', () => {
    mockGoalsData = { allGoals: [] }
    mockIsFetched = true
    render(<GoalsView />)
    const trigger = screen.getByRole('button', { name: 'goals.filters.statusFilter' })
    expect(trigger).toHaveAttribute('aria-pressed', 'false')
    openFilterMenu()
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'goals.filters.active' }))
    expect(trigger).toHaveAttribute('aria-pressed', 'true')
  })
})
