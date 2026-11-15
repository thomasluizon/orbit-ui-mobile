import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { MoveParentOverlay, type MoveParentOption } from '@/components/habits/habit-list/move-parent-overlay'

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

const option = (overrides: Partial<MoveParentOption>): MoveParentOption => ({ id: 'option', label: 'Option', emoji: null, depth: 0, childCount: 0, disabled: false, reason: null, ...overrides })
const destinations = [option({ id: null, label: 'habits.moveParent.toRoot' }), option({ id: 'parent', label: 'Parent' }), option({ id: 'other', label: 'Other' })]

function renderOverlay(overrides: Partial<Parameters<typeof MoveParentOverlay>[0]> = {}) {
  const props: Parameters<typeof MoveParentOverlay>[0] = {
    t: (key) => key, open: true, isMoving: false, movingHabitTitle: 'Exercise', movingHabitParentId: 'parent',
    options: destinations, selectedMoveParentId: null, canSubmit: true, onClose: vi.fn(), onConfirm: vi.fn(), onSelectOption: vi.fn(), ...overrides,
  }
  render(<MoveParentOverlay {...props} />)
  return props
}

afterEach(cleanup)

describe('web move-parent overlay as one question', () => {
  it('asks where the habit goes as the sheet title, once, with the destinations as the options', () => {
    enableTestFlags('orbit_guided_flows')
    const props = renderOverlay()
    expect(screen.getByRole('dialog')).toHaveAccessibleName('habits.moveParent.destinations')
    expect(document.querySelector('[data-field-question]')).toBeNull()
    expect(screen.getAllByText('habits.moveParent.destinations')).toHaveLength(1)
    expect(screen.getByText('habits.moveParent.description')).toBeInTheDocument()
    const group = screen.getByRole('radiogroup', { name: 'habits.moveParent.destinations' })
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(3)
    fireEvent.click(screen.getByRole('radio', { name: /Other/ }))
    expect(props.onSelectOption).toHaveBeenCalledWith('other')
    expect(document.querySelector('[data-asset="orbit-mascot"]')).toBeNull()
  })

  it('keeps the current parent mark, the confirm action and the cancel action', () => {
    enableTestFlags('orbit_guided_flows')
    const props = renderOverlay({ selectedMoveParentId: 'other' })
    expect(screen.getByText('habits.moveParent.currentParent')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'habits.moveParent.confirm' }))
    expect(props.onConfirm).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'common.cancel' })).toBeInTheDocument()
  })

  it('names the group of habits under the question for a bulk move', () => {
    enableTestFlags('orbit_guided_flows')
    renderOverlay({ movingHabitTitle: null, movingHabitCount: 3 })
    expect(screen.getByRole('dialog')).toHaveAccessibleName('habits.moveParent.destinations')
    expect(screen.getByText('habits.moveParent.titleMany')).toBeInTheDocument()
  })

  it('keeps the retry of a failed destination read', () => {
    enableTestFlags('orbit_guided_flows')
    const props = renderOverlay({ inventoryState: 'error', onRetryInventory: vi.fn() })
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    expect(props.onRetryInventory).toHaveBeenCalledOnce()
  })

  it('keeps the parent picker of the editor as it is', () => {
    enableTestFlags('orbit_guided_flows')
    renderOverlay({ selectionOnly: true })
    expect(screen.getByRole('dialog')).toHaveAccessibleName('habits.form.parentHabit')
    expect(document.querySelector('[data-field-question]')).not.toBeNull()
  })

  it('renders the current overlay with the flag off', () => {
    renderOverlay()
    expect(screen.getByRole('dialog')).toHaveAccessibleName('habits.moveParent.title')
    expect(document.querySelector('[data-field-question]')).toHaveTextContent('habits.moveParent.destinations')
  })
})
