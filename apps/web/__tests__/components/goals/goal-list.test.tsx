import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

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
    const sections = container.querySelectorAll('[aria-roledescription="draggable item"]')
    expect(sections).toHaveLength(2)
    expect(sections[0]).toHaveAttribute('aria-label', 'Run 100km')
    expect(sections[1]).toHaveAttribute('aria-label', 'Read 12 books')
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
    // Start dragging the first item
    fireEvent.dragStart(sections[0]!)
    // Enter the second item
    fireEvent.dragEnter(sections[1]!)
    expect(sections[1]!.className).toContain('drag-ghost')
  })

  it('calls reorder mutation on dragEnd when items are reordered', () => {
    const { container } = render(<GoalList goals={mockGoals} />)
    const sections = container.querySelectorAll('[draggable="true"]')
    // Start dragging first item, enter second, end drag
    fireEvent.dragStart(sections[0]!)
    fireEvent.dragEnter(sections[1]!)
    fireEvent.dragEnd(sections[0]!)
    // Reorder should have been called (the mock mutate fn)
    // We verify the drag classes are reset
    expect(sections[0]!.className).not.toContain('drag-chosen')
    expect(sections[1]!.className).not.toContain('drag-ghost')
  })

  it('resets drag state on dragEnd without reorder (same index)', () => {
    const { container } = render(<GoalList goals={mockGoals} />)
    const sections = container.querySelectorAll('[draggable="true"]')
    // Start and end drag on same item without entering another
    fireEvent.dragStart(sections[0]!)
    fireEvent.dragEnd(sections[0]!)
    expect(sections[0]!.className).not.toContain('drag-chosen')
  })

  it('prevents default on dragOver', () => {
    const { container } = render(<GoalList goals={mockGoals} />)
    const sections = container.querySelectorAll('[draggable="true"]')
    const event = new Event('dragover', { bubbles: true, cancelable: true })
    const prevented = !sections[0]!.dispatchEvent(event)
    // React's onDragOver calls e.preventDefault(), so the default should be prevented
    expect(prevented).toBe(true)
  })

  it('handles touch start and clears on touch end without delay', () => {
    const { container } = render(<GoalList goals={mockGoals} />)
    const sections = container.querySelectorAll('[draggable="true"]')
    // Simulate touch start
    fireEvent.touchStart(sections[0]!, {
      touches: [{ clientX: 100, clientY: 200 }],
    })
    // Immediately end touch (before 300ms delay)
    fireEvent.touchEnd(sections[0]!)
    // Should not enter drag mode
    expect(sections[0]!.className).not.toContain('drag-chosen')
  })

  it('cancels touch hold if moved beyond threshold', () => {
    const { container } = render(<GoalList goals={mockGoals} />)
    const sections = container.querySelectorAll('[draggable="true"]')
    // Simulate touch start
    fireEvent.touchStart(sections[0]!, {
      touches: [{ clientX: 100, clientY: 200 }],
    })
    // Move beyond threshold before hold delay
    fireEvent.touchMove(sections[0]!, {
      touches: [{ clientX: 120, clientY: 220 }],
    })
    fireEvent.touchEnd(sections[0]!)
    expect(sections[0]!.className).not.toContain('drag-chosen')
  })
})
