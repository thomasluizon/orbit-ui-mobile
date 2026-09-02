import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SortableHabitItem } from '@/components/habits/habit-list/sortable-habit-item'

const sortable = vi.hoisted(() => ({ isDragging: false }))

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: sortable.isDragging,
  }),
}))

describe('sortable habit stacking', () => {
  beforeEach(() => {
    sortable.isDragging = false
  })

  it('raises only the dragged row within the local sibling scale', () => {
    sortable.isDragging = true
    render(
      <SortableHabitItem id="habit-1">
        <span>Read</span>
      </SortableHabitItem>,
    )

    expect(screen.getByText('Read').parentElement).toHaveStyle({
      opacity: '0.5',
      zIndex: '1',
    })
  })

  it('returns a resting row to automatic stacking', () => {
    render(
      <SortableHabitItem id="habit-1">
        <span>Read</span>
      </SortableHabitItem>,
    )

    expect(screen.getByText('Read').parentElement).toHaveStyle({
      opacity: '1',
      zIndex: 'auto',
    })
  })
})
