import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockHabit } from '@orbit/shared/__tests__/factories'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

import { HabitRow } from '@/components/habits/habit-row'

describe('HabitRow canonical content', () => {
  it('renders title and meta, not descriptions or tags', () => {
    render(
      <HabitRow
        habit={createMockHabit({
          title: 'Meditate',
          description: 'Ten minutes of breathing',
          tags: [{ id: '1', name: 'Evening', color: '#7c3aed' }],
        })}
        meta={['Daily']}
      />,
    )
    expect(screen.getByText('Meditate')).toBeDefined()
    expect(screen.getByText('Daily')).toBeDefined()
    expect(screen.queryByText('Ten minutes of breathing')).toBeNull()
    expect(screen.queryByText('Evening')).toBeNull()
  })

  it('uses the first uppercase letter when an emoji is missing', () => {
    render(<HabitRow habit={createMockHabit({ title: 'read', emoji: null })} />)
    expect(screen.getByText('R')).toBeDefined()
  })

  it('renders child geometry at display depth one', () => {
    render(<HabitRow habit={createMockHabit({ title: 'Child' })} child depth={1} />)
    expect(screen.getByTestId('habit-row')).toHaveAttribute('data-depth', '1')
  })
})

describe('HabitRow check circle accessible name', () => {
  it('makes a read-only row dim and untappable', () => {
    const onDetail = vi.fn()
    const onLog = vi.fn()
    render(
      <HabitRow
        habit={createMockHabit({ title: 'Meditate' })}
        readOnly
        actions={{ onDetail, onLog }}
      />,
    )

    const row = screen.getByTestId('habit-row')
    expect(row).toHaveAttribute('aria-disabled', 'true')
    expect(row).toHaveStyle({ opacity: '0.5', pointerEvents: 'none' })
    expect(onDetail).not.toHaveBeenCalled()
    expect(onLog).not.toHaveBeenCalled()
  })

  it('announces the state and log action when loggable', () => {
    render(<HabitRow habit={createMockHabit({ title: 'Meditate' })} />)
    expect(screen.getByTestId('habit-status-toggle')).toHaveAttribute('aria-label', 'habits.statusDot.empty, habits.logHabit: Meditate')
    expect(screen.getByTestId('habit-status-toggle')).not.toHaveAttribute('aria-disabled')
  })

  it('announces the unlog action when done', () => {
    render(<HabitRow habit={createMockHabit({ title: 'Meditate' })} state="done" />)
    expect(screen.getByTestId('habit-status-toggle')).toHaveAttribute('aria-label', 'habits.statusDot.done, habits.actions.unlog: Meditate')
  })

  it('announces parent progress and the parent action', () => {
    render(
      <HabitRow
        habit={createMockHabit({ title: 'Morning routine' })}
        hasChildren
        childProgress={{ done: 1, total: 2 }}
      />,
    )
    expect(
      screen.getByRole('button', {
        name: 'habits.statusDot.empty, habits.logHabit: Morning routine, 1/2',
      }),
    ).toBeInTheDocument()
  })

  it('logs a parent with open children directly from its ring', () => {
    const onLog = vi.fn()
    render(
      <HabitRow
        habit={createMockHabit({ title: 'Morning routine' })}
        hasChildren
        childProgress={{ done: 1, total: 2 }}
        actions={{ onLog }}
      />,
    )

    screen.getByRole('button', {
      name: 'habits.statusDot.empty, habits.logHabit: Morning routine, 1/2',
    }).click()
    expect(onLog).toHaveBeenCalledOnce()
  })
})
