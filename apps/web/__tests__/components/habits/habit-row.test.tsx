import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  it('makes every read-only descendant inert for keyboard and synthetic activation', async () => {
    const user = userEvent.setup()
    const onDetail = vi.fn()
    const onLog = vi.fn()
    const onToggleExpand = vi.fn()
    const onEdit = vi.fn()
    render(
      <>
        <button type="button">Before</button>
        <HabitRow
          habit={createMockHabit({ title: 'Meditate' })}
          readOnly
          hasChildren
          childProgress={{ done: 0, total: 1 }}
          actions={{ onDetail, onLog, onToggleExpand, onEdit }}
        />
        <button type="button">After</button>
      </>,
    )

    const row = screen.getByTestId('habit-row')
    expect(row).toHaveAttribute('aria-disabled', 'true')
    expect(row).toHaveStyle({ opacity: '0.5' })
    expect(row).not.toHaveStyle({ pointerEvents: 'none' })

    const rowButtons = Array.from(row.querySelectorAll('button'))
    expect(rowButtons).toHaveLength(4)
    for (const button of rowButtons) {
      expect(button).toBeDisabled()
      fireEvent.keyDown(button, { key: 'Enter' })
      fireEvent.keyDown(button, { key: ' ' })
      fireEvent.click(button)
    }
    fireEvent.contextMenu(row)

    await user.click(screen.getByRole('button', { name: 'Before' }))
    await user.tab()
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus()
    expect(onDetail).not.toHaveBeenCalled()
    expect(onLog).not.toHaveBeenCalled()
    expect(onToggleExpand).not.toHaveBeenCalled()
    expect(onEdit).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('keeps normal row descendants enabled and operable', () => {
    const onDetail = vi.fn()
    const onLog = vi.fn()
    const onToggleExpand = vi.fn()
    const onEdit = vi.fn()
    render(
      <HabitRow
        habit={createMockHabit({ title: 'Meditate' })}
        hasChildren
        childProgress={{ done: 0, total: 1 }}
        actions={{ onDetail, onLog, onToggleExpand, onEdit }}
      />,
    )

    const row = screen.getByTestId('habit-row')
    const rowButtons = Array.from(row.querySelectorAll('button'))
    expect(rowButtons).toHaveLength(4)
    for (const button of rowButtons) expect(button).not.toBeDisabled()

    fireEvent.click(rowButtons[0]!)
    fireEvent.click(rowButtons[1]!)
    fireEvent.click(rowButtons[2]!)
    fireEvent.click(rowButtons[3]!)
    expect(onToggleExpand).toHaveBeenCalledOnce()
    expect(onDetail).toHaveBeenCalledOnce()
    expect(onLog).toHaveBeenCalledOnce()
    expect(screen.getByRole('menu')).toBeInTheDocument()
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
