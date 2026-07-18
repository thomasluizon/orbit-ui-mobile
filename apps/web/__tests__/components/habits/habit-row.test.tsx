import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createMockHabit } from '@orbit/shared/__tests__/factories'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { HabitRow } from '@/components/habits/habit-row'

describe('HabitRow drill-in and expand chevrons', () => {
  it('opens a level-2 family in focus via the drill chevron instead of expanding', () => {
    const onDrillInto = vi.fn()
    const onToggleExpand = vi.fn()
    render(
      <HabitRow
        habit={createMockHabit({ id: 'grandchild', title: 'Glass' })}
        depth={2}
        child
        hasChildren
        actions={{ onDrillInto, onToggleExpand }}
      />,
    )

    const drill = screen.getByLabelText('habits.actions.openSubHabits')
    fireEvent.click(drill)

    expect(onDrillInto).toHaveBeenCalledTimes(1)
    expect(onToggleExpand).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('common.expand')).toBeNull()
  })

  it('expands a top-level family in place with the grey expand chevron', () => {
    const onDrillInto = vi.fn()
    const onToggleExpand = vi.fn()
    render(
      <HabitRow
        habit={createMockHabit({ id: 'root', title: 'Water' })}
        depth={0}
        hasChildren
        actions={{ onDrillInto, onToggleExpand }}
      />,
    )

    const expand = screen.getByLabelText('common.expand')
    fireEvent.click(expand)

    expect(onToggleExpand).toHaveBeenCalledTimes(1)
    expect(onDrillInto).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('habits.actions.openSubHabits')).toBeNull()
  })

  it('keeps the per-row overflow menu on a drilled sub-habit family', () => {
    render(
      <HabitRow
        habit={createMockHabit({ id: 'grandchild', title: 'Glass' })}
        depth={2}
        child
        hasChildren
        inPanel
        actions={{ onDrillInto: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() }}
      />,
    )

    expect(screen.getByLabelText('habits.actions.more')).toBeDefined()
    expect(screen.getByLabelText('habits.actions.openSubHabits')).toBeDefined()
  })
})

describe('HabitRow description preview', () => {
  it('renders a single-line description below the title when present', () => {
    render(
      <HabitRow
        habit={createMockHabit({ title: 'Meditate', description: 'Ten minutes of breathing' })}
      />,
    )

    expect(screen.getByText('Meditate')).toBeDefined()
    expect(screen.getByText('Ten minutes of breathing')).toBeDefined()
  })

  it('omits the description when the habit has none', () => {
    render(<HabitRow habit={createMockHabit({ title: 'Run', description: null })} />)

    expect(screen.getByText('Run')).toBeDefined()
    expect(screen.queryByText('Ten minutes of breathing')).toBeNull()
  })

  it('renders the description on child (sub-habit) rows too', () => {
    render(
      <HabitRow
        habit={createMockHabit({ title: 'Sub-habit', description: 'Child preview' })}
        child
        depth={1}
      />,
    )

    expect(screen.getByText('Child preview')).toBeDefined()
  })
})

describe('HabitRow check circle accessible name', () => {
  it('announces the state and the log action when the habit is loggable', () => {
    render(<HabitRow habit={createMockHabit({ title: 'Meditate' })} />)

    expect(screen.getByTestId('habit-status-toggle')).toHaveAttribute(
      'aria-label',
      'habits.statusDot.empty, habits.logHabit',
    )
  })

  it('announces the unlog action when the habit is done', () => {
    render(
      <HabitRow habit={createMockHabit({ title: 'Meditate' })} state="done" />,
    )

    expect(screen.getByTestId('habit-status-toggle')).toHaveAttribute(
      'aria-label',
      'habits.statusDot.done, habits.actions.unlog',
    )
  })
})

describe('HabitRow tags', () => {
  it('renders the habit tag names on the row', () => {
    render(
      <HabitRow
        habit={createMockHabit({
          title: 'Read',
          tags: [
            { id: '1', name: 'Learning', color: '#7c3aed' },
            { id: '2', name: 'Evening', color: '#10b981' },
          ],
        })}
      />,
    )

    expect(screen.getByText('Learning')).toBeDefined()
    expect(screen.getByText('Evening')).toBeDefined()
  })

  it('caps visible tags at three and shows a +N overflow counter for the rest', () => {
    render(
      <HabitRow
        habit={createMockHabit({
          title: 'Read',
          tags: Array.from({ length: 10 }, (_, i) => ({
            id: String(i),
            name: `Tag${i}`,
            color: '#7c3aed',
          })),
        })}
      />,
    )

    expect(screen.getByText('Tag0')).toBeDefined()
    expect(screen.getByText('Tag1')).toBeDefined()
    expect(screen.getByText('Tag2')).toBeDefined()
    expect(screen.queryByText('Tag3')).toBeNull()
    expect(screen.getByText('+7')).toBeDefined()
  })
})
