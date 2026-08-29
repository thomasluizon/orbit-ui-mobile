import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { RefObject } from 'react'
import type { HabitListHandle } from '@/components/habits/habit-list'
import { useTodaySelection } from '@/app/(app)/use-today-selection'

const mocks = vi.hoisted(() => ({
  store: {
    selectedHabitIds: new Set<string>(),
    toggleSelectionCascade: vi.fn(),
    selectAllHabits: vi.fn(),
    clearSelection: vi.fn(),
  },
  bulkActions: {
    showBulkDeleteConfirm: false,
    setShowBulkDeleteConfirm: vi.fn(),
    confirmBulkDelete: vi.fn(),
    confirmBulkLog: vi.fn(),
    confirmBulkSkip: vi.fn(),
  },
  useBulkActions: vi.fn(),
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: typeof mocks.store) => unknown) => selector(mocks.store),
}))

vi.mock('@/hooks/use-bulk-actions', () => ({
  useBulkActions: (options: unknown) => {
    mocks.useBulkActions(options)
    return mocks.bulkActions
  },
}))

describe('web useTodaySelection date scope', () => {
  beforeEach(() => {
    mocks.store.selectedHabitIds = new Set(['habit-1'])
    mocks.store.clearSelection.mockReset()
    mocks.bulkActions.setShowBulkDeleteConfirm.mockReset()
    mocks.useBulkActions.mockReset()
  })

  it('clears a loggable-day selection when the viewed date becomes read only', () => {
    const habitListRef = { current: null } as RefObject<HabitListHandle | null>
    const { rerender } = renderHook(
      ({ selectedDateStr }) => useTodaySelection({
        selectedDateStr,
        today: '2026-04-08',
        habitsById: new Map(),
        childrenByParent: new Map(),
        habitsCount: 1,
        habitListRef,
      }),
      { initialProps: { selectedDateStr: '2026-04-01' } },
    )

    expect(mocks.store.clearSelection).not.toHaveBeenCalled()
    expect(mocks.useBulkActions).toHaveBeenLastCalledWith(
      expect.objectContaining({ readOnly: false }),
    )

    rerender({ selectedDateStr: '2026-03-31' })

    expect(mocks.store.clearSelection).toHaveBeenCalledTimes(1)
    expect(mocks.bulkActions.setShowBulkDeleteConfirm).toHaveBeenCalledWith(false)
    expect(mocks.useBulkActions).toHaveBeenLastCalledWith(
      expect.objectContaining({ readOnly: true }),
    )
  })
})
