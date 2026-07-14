import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HabitRowMenu } from '@/components/habits/habit-row-menu'

const translate = ((key: string) => key) as unknown as Parameters<typeof HabitRowMenu>[0]['t']

describe('HabitRowMenu', () => {
  it('renders only the actions whose handlers are provided', () => {
    render(<HabitRowMenu close={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} t={translate} />)
    expect(screen.getByRole('menuitem', { name: 'common.edit' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'habits.deleteHabit' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'habits.actions.skip' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'habits.moveParent.button' })).not.toBeInTheDocument()
  })

  it('runs the handler and closes the menu on selection', () => {
    const close = vi.fn()
    const onEdit = vi.fn()
    render(<HabitRowMenu close={close} onEdit={onEdit} t={translate} />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'common.edit' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('still closes when a selected action has no handler bound', () => {
    const close = vi.fn()
    render(<HabitRowMenu close={close} onSkip={vi.fn()} onReschedule={vi.fn()} t={translate} />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'habits.actions.reschedule' }))
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('exposes every action when all handlers are supplied', () => {
    render(
      <HabitRowMenu
        close={vi.fn()}
        onEdit={vi.fn()}
        onDuplicate={vi.fn()}
        onAddSubHabit={vi.fn()}
        onMoveParent={vi.fn()}
        onSkip={vi.fn()}
        onReschedule={vi.fn()}
        onDelete={vi.fn()}
        onEnterSelectMode={vi.fn()}
        onDrillInto={vi.fn()}
        t={translate}
      />,
    )
    expect(screen.getAllByRole('menuitem')).toHaveLength(9)
  })
})
