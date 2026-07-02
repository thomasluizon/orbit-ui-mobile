import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const reorderMutate = vi.fn()

vi.mock('@/hooks/use-goals', () => ({
  useReorderGoals: () => ({ mutate: reorderMutate }),
}))

interface MockGoalCardProps {
  goal: { id: string; title: string }
  onOpenDetail: (goalId: string, initialAction: string | null) => void
}

vi.mock('@/components/goals/goal-card', () => ({
  GoalCard: ({ goal, onOpenDetail }: MockGoalCardProps) => (
    <div data-testid={`goal-${goal.id}`}>
      <button type="button" onClick={() => onOpenDetail(goal.id, null)}>
        {goal.title}
      </button>
    </div>
  ),
}))

vi.mock('@/components/goals/goal-detail-drawer', () => ({
  GoalDetailDrawer: ({
    open,
    goalId,
    initialAction,
  }: {
    open: boolean
    goalId: string
    initialAction?: string | null
  }) =>
    open ? (
      <div
        data-testid="goal-detail-drawer"
        data-goal-id={goalId}
        data-initial-action={initialAction ?? ''}
      />
    ) : null,
}))

import { GoalList } from '@/components/goals/goal-list'
import type { Goal } from '@orbit/shared/types/goal'

function makeGoal(id: string, position: number): Goal {
  return {
    id,
    title: `Goal ${id}`,
    description: null,
    targetValue: 100,
    currentValue: 50,
    unit: 'km',
    deadline: null,
    status: 'Active',
    progressPercentage: 50,
    createdAtUtc: '2025-01-01T00:00:00Z',
    completedAtUtc: null,
    position,
  }
}

const mockGoals: Goal[] = [makeGoal('g1', 0), makeGoal('g2', 1)]

const fiveGoals: Goal[] = [
  makeGoal('a', 0),
  makeGoal('b', 1),
  makeGoal('c', 2),
  makeGoal('d', 3),
  makeGoal('e', 4),
]

describe('GoalList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

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

  it('renders empty list when no goals provided', () => {
    const { container } = render(<GoalList goals={[]} />)
    const draggables = container.querySelectorAll('[draggable="true"]')
    expect(draggables).toHaveLength(0)
  })

  it('renders a single goal', () => {
    render(<GoalList goals={[mockGoals[0]!]} />)
    expect(screen.getByTestId('goal-g1')).toBeInTheDocument()
    expect(screen.queryByTestId('goal-g2')).not.toBeInTheDocument()
  })

  it('sets aria-roledescription on draggable sections', () => {
    const { container } = render(<GoalList goals={mockGoals} />)
    const sections = container.querySelectorAll('[aria-roledescription="goals.dragItem"]')
    expect(sections).toHaveLength(2)
    expect(sections[0]).toHaveAttribute('aria-label', 'Goal g1')
    expect(sections[1]).toHaveAttribute('aria-label', 'Goal g2')
  })

  it('applies drag-chosen class on dragStart', () => {
    const { container } = render(<GoalList goals={mockGoals} />)
    const sections = container.querySelectorAll('[draggable="true"]')
    const firstSection = sections[0]!
    fireEvent.dragStart(firstSection)
    expect(firstSection.className).toContain('drag-chosen')
  })

  it('applies drag-ghost class on dragEnter', () => {
    const { container } = render(<GoalList goals={mockGoals} />)
    const sections = container.querySelectorAll('[draggable="true"]')
    fireEvent.dragStart(sections[0]!)
    fireEvent.dragEnter(sections[1]!)
    expect(sections[1]!.className).toContain('drag-ghost')
  })

  it('calls reorder mutation on dragEnd when items are reordered', () => {
    const { container } = render(<GoalList goals={mockGoals} />)
    const sections = container.querySelectorAll('[draggable="true"]')
    fireEvent.dragStart(sections[0]!)
    fireEvent.dragEnter(sections[1]!)
    fireEvent.dragEnd(sections[0]!)
    expect(reorderMutate).toHaveBeenCalledWith([
      { id: 'g2', position: 0 },
      { id: 'g1', position: 1 },
    ])
    expect(sections[0]!.className).not.toContain('drag-chosen')
    expect(sections[1]!.className).not.toContain('drag-ghost')
  })

  it('submits arrayMove order for a forward drag (index 1 to 3)', () => {
    const { container } = render(<GoalList goals={fiveGoals} />)
    const sections = container.querySelectorAll('[draggable="true"]')
    fireEvent.dragStart(sections[1]!)
    fireEvent.dragEnter(sections[3]!)
    fireEvent.dragEnd(sections[1]!)
    expect(reorderMutate).toHaveBeenCalledWith([
      { id: 'a', position: 0 },
      { id: 'c', position: 1 },
      { id: 'd', position: 2 },
      { id: 'b', position: 3 },
      { id: 'e', position: 4 },
    ])
  })

  it('submits arrayMove order for a backward drag (index 3 to 1)', () => {
    const { container } = render(<GoalList goals={fiveGoals} />)
    const sections = container.querySelectorAll('[draggable="true"]')
    fireEvent.dragStart(sections[3]!)
    fireEvent.dragEnter(sections[1]!)
    fireEvent.dragEnd(sections[3]!)
    expect(reorderMutate).toHaveBeenCalledWith([
      { id: 'a', position: 0 },
      { id: 'd', position: 1 },
      { id: 'b', position: 2 },
      { id: 'c', position: 3 },
      { id: 'e', position: 4 },
    ])
  })

  it('resets drag state on dragEnd without reorder (same index)', () => {
    const { container } = render(<GoalList goals={mockGoals} />)
    const sections = container.querySelectorAll('[draggable="true"]')
    fireEvent.dragStart(sections[0]!)
    fireEvent.dragEnd(sections[0]!)
    expect(reorderMutate).not.toHaveBeenCalled()
    expect(sections[0]!.className).not.toContain('drag-chosen')
  })

  it('prevents default on dragOver', () => {
    const { container } = render(<GoalList goals={mockGoals} />)
    const sections = container.querySelectorAll('[draggable="true"]')
    const event = new Event('dragover', { bubbles: true, cancelable: true })
    const prevented = !sections[0]!.dispatchEvent(event)
    expect(prevented).toBe(true)
  })

  it('handles touch start and clears on touch end without delay', () => {
    const { container } = render(<GoalList goals={mockGoals} />)
    const sections = container.querySelectorAll('[draggable="true"]')
    fireEvent.touchStart(sections[0]!, {
      touches: [{ clientX: 100, clientY: 200 }],
    })
    fireEvent.touchEnd(sections[0]!)
    expect(sections[0]!.className).not.toContain('drag-chosen')
  })

  it('cancels touch hold if moved beyond threshold', () => {
    const { container } = render(<GoalList goals={mockGoals} />)
    const sections = container.querySelectorAll('[draggable="true"]')
    fireEvent.touchStart(sections[0]!, {
      touches: [{ clientX: 100, clientY: 200 }],
    })
    fireEvent.touchMove(sections[0]!, {
      touches: [{ clientX: 120, clientY: 220 }],
    })
    fireEvent.touchEnd(sections[0]!)
    expect(sections[0]!.className).not.toContain('drag-chosen')
  })

  it('mounts a single detail drawer for the card that requested it', () => {
    render(<GoalList goals={mockGoals} />)
    expect(screen.queryByTestId('goal-detail-drawer')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Goal g2'))

    const drawer = screen.getByTestId('goal-detail-drawer')
    expect(drawer).toHaveAttribute('data-goal-id', 'g2')
    expect(drawer).toHaveAttribute('data-initial-action', '')
    expect(screen.getAllByTestId('goal-detail-drawer')).toHaveLength(1)
  })
})
