import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import { SortableHabitItem } from '@/components/habits/habit-list/sortable-habit-item'
import { reorderTransition } from '@/components/motion/list-motion'
import { motionDurations, motionEasings, motionSprings } from '@orbit/shared/theme'

const sortable = vi.hoisted(() => ({ isDragging: false, reduced: false, options: undefined as { id: string; transition: unknown } | undefined }))
vi.mock('@/hooks/use-viewport-match', () => ({ useViewportMatch: () => sortable.reduced }))

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: (options: { id: string; transition: unknown }) => {
    sortable.options = options
    return {
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: sortable.isDragging,
    }
  },
}))

describe('sortable habit stacking', () => {
  beforeEach(() => {
    sortable.isDragging = false
    sortable.reduced = false
    sortable.options = undefined
  })

  it('dims and raises only the dragged row within the local sibling scale', () => {
    sortable.isDragging = true
    render(
      <NextIntlClientProvider locale="en" messages={en}><SortableHabitItem id="habit-1">
        <span>Read</span>
      </SortableHabitItem></NextIntlClientProvider>,
    )

    expect(screen.getByText('Read').parentElement).toHaveStyle({
      opacity: '0.5',
      zIndex: '1',
    })
  })

  it('returns a resting row to automatic stacking', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}><SortableHabitItem id="habit-1">
        <span>Read</span>
      </SortableHabitItem></NextIntlClientProvider>,
    )

    expect(screen.getByText('Read').parentElement).toHaveStyle({
      opacity: '1',
      zIndex: 'auto',
    })
  })

  it('moves siblings on the shared soft spring response and the enter easing', () => {
    render(<SortableHabitItem id="habit-1"><span>Read</span></SortableHabitItem>)

    expect(sortable.options?.transition).toBe(reorderTransition)
    expect(reorderTransition.duration).toBe(390)
    expect(reorderTransition.duration).toBeGreaterThan(motionDurations.slow)
    expect(reorderTransition.easing).toBe(`cubic-bezier(${motionEasings.enter.join(',')})`)
  })

  it('moves siblings instantly under reduced motion', () => {
    sortable.reduced = true
    render(<SortableHabitItem id="habit-1"><span>Read</span></SortableHabitItem>)

    expect(sortable.options?.transition).toBeNull()
  })

})
