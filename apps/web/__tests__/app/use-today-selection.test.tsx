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

const habitListRef = { current: null } as RefObject<HabitListHandle | null>

function renderSelection(selectedDateStr: string, today: string) {
  return renderHook(
    (props: { selectedDateStr: string; today: string }) => useTodaySelection({
      ...props,
      habitsById: new Map(),
      childrenByParent: new Map(),
      habitsCount: 1,
      habitListRef,
    }),
    { initialProps: { selectedDateStr, today } },
  )
}

describe('web useTodaySelection date scope', () => {
  beforeEach(() => {
    mocks.store.selectedHabitIds = new Set(['habit-1'])
    mocks.store.clearSelection.mockReset()
    mocks.bulkActions.showBulkDeleteConfirm = false
    Object.values(mocks.bulkActions).forEach((value) => {
      if (typeof value === 'function') value.mockReset()
    })
    mocks.useBulkActions.mockReset()
  })

  it('clears a pinned selection when today advances past its loggable window', () => {
    const { rerender } = renderSelection('2026-04-01', '2026-04-08')

    expect(mocks.store.clearSelection).not.toHaveBeenCalled()
    expect(mocks.useBulkActions).toHaveBeenLastCalledWith(
      expect.objectContaining({ readOnly: false }),
    )

    rerender({ selectedDateStr: '2026-04-01', today: '2026-04-09' })

    expect(mocks.store.clearSelection).toHaveBeenCalledTimes(1)
    expect(mocks.bulkActions.setShowBulkDeleteConfirm).toHaveBeenCalledWith(false)
    expect(mocks.useBulkActions).toHaveBeenLastCalledWith(
      expect.objectContaining({ readOnly: true }),
    )
  })

  it('closes an open bulk delete confirmation when today makes the pinned date read only', () => {
    mocks.bulkActions.showBulkDeleteConfirm = true
    const { rerender } = renderSelection('2026-04-01', '2026-04-08')

    rerender({ selectedDateStr: '2026-04-01', today: '2026-04-09' })

    expect(mocks.bulkActions.setShowBulkDeleteConfirm).toHaveBeenCalledWith(false)
  })

  it('clears a loggable-day selection when navigation makes the viewed date read only', () => {
    const { rerender } = renderSelection('2026-04-01', '2026-04-08')

    rerender({ selectedDateStr: '2026-03-31', today: '2026-04-08' })

    expect(mocks.store.clearSelection).toHaveBeenCalledTimes(1)
    expect(mocks.bulkActions.setShowBulkDeleteConfirm).toHaveBeenCalledWith(false)
  })

  it('leaves selection and bulk actions unchanged on a loggable day', () => {
    const { result, rerender } = renderSelection('2026-04-02', '2026-04-08')

    rerender({ selectedDateStr: '2026-04-02', today: '2026-04-08' })
    void result.current.confirmBulkLog()

    expect(mocks.store.clearSelection).not.toHaveBeenCalled()
    expect(mocks.bulkActions.setShowBulkDeleteConfirm).not.toHaveBeenCalled()
    expect(mocks.bulkActions.confirmBulkLog).toHaveBeenCalledTimes(1)
    expect(mocks.useBulkActions).toHaveBeenLastCalledWith(
      expect.objectContaining({ readOnly: false }),
    )
  })
})
