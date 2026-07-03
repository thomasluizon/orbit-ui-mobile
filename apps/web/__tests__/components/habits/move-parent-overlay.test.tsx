import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({
    open,
    children,
    footer,
  }: {
    open: boolean
    children?: ReactNode
    footer?: ReactNode
  }) =>
    open ? (
      <div>
        {children}
        {footer}
      </div>
    ) : null,
}))

import {
  MoveParentOverlay,
  type MoveParentOption,
} from '@/components/habits/habit-list/move-parent-overlay'

function makeOption(overrides: Partial<MoveParentOption>): MoveParentOption {
  return {
    id: 'option',
    label: 'Option',
    emoji: '⭐️',
    depth: 0,
    childCount: 0,
    disabled: false,
    reason: null,
    ...overrides,
  }
}

function renderOverlay(options: MoveParentOption[], onSelectOption = vi.fn()) {
  render(
    <MoveParentOverlay
      t={(key) => key}
      open
      isMoving={false}
      movingHabitTitle="Exercise"
      movingHabitParentId={null}
      options={options}
      selectedMoveParentId={null}
      canSubmit={false}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
      onSelectOption={onSelectOption}
    />,
  )
  return { onSelectOption }
}

describe('MoveParentOverlay', () => {
  it('renders a selectable root row and the destinations eyebrow', () => {
    const { onSelectOption } = renderOverlay([
      makeOption({ id: null, label: 'habits.moveParent.toRoot' }),
      makeOption({ id: 'parent', label: 'Parent' }),
    ])

    expect(screen.getByText('habits.moveParent.destinations')).toBeInTheDocument()

    const rootRow = screen.getByText('habits.moveParent.toRoot').closest('button')
    if (!rootRow) throw new Error('Expected the root row button')
    fireEvent.click(rootRow)
    expect(onSelectOption).toHaveBeenCalledWith(null)
  })

  it('shows the child count for a habit with children', () => {
    renderOverlay([
      makeOption({ id: null, label: 'habits.moveParent.toRoot' }),
      makeOption({ id: 'parent', label: 'Parent', childCount: 12 }),
    ])

    const parentRow = screen.getByText('Parent').closest('button')
    if (!parentRow) throw new Error('Expected the parent row button')
    expect(within(parentRow).getByText('12')).toBeInTheDocument()
  })

  it('reveals the search field only when destinations exceed eight', () => {
    renderOverlay([
      makeOption({ id: null, label: 'habits.moveParent.toRoot' }),
      makeOption({ id: 'parent', label: 'Parent' }),
    ])
    expect(
      screen.queryByPlaceholderText('habits.moveParent.searchPlaceholder'),
    ).not.toBeInTheDocument()

    render(<div />)

    renderOverlay([
      makeOption({ id: null, label: 'habits.moveParent.toRoot' }),
      ...Array.from({ length: 9 }, (_, index) =>
        makeOption({ id: `d${index}`, label: `Zeta ${index}` }),
      ),
    ])
    expect(
      screen.getByPlaceholderText('habits.moveParent.searchPlaceholder'),
    ).toBeInTheDocument()
  })

  it('filters the tree by search while keeping the ancestor chain', () => {
    renderOverlay([
      makeOption({ id: null, label: 'habits.moveParent.toRoot' }),
      makeOption({ id: 'alpha', label: 'Alpha', depth: 0, childCount: 1 }),
      makeOption({ id: 'bravo', label: 'Bravo', depth: 1 }),
      ...Array.from({ length: 9 }, (_, index) =>
        makeOption({ id: `zeta${index}`, label: `Zeta ${index}` }),
      ),
    ])

    const search = screen.getByPlaceholderText('habits.moveParent.searchPlaceholder')
    fireEvent.change(search, { target: { value: 'bravo' } })

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Bravo')).toBeInTheDocument()
    expect(screen.queryByText('Zeta 0')).not.toBeInTheDocument()
  })
})
