import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBulkActions } from '@/hooks/use-bulk-actions'
import type { HabitListHandle } from '@/components/habits/habit-list'

const bulkDelete = { mutateAsync: vi.fn() }
const bulkLog = { mutateAsync: vi.fn() }
const bulkSkip = { mutateAsync: vi.fn() }
const VIEWED_DATE = '2026-04-01'

vi.mock('@/hooks/use-habits', () => ({
  useBulkDeleteHabits: () => bulkDelete,
  useBulkLogHabits: () => bulkLog,
  useBulkSkipHabits: () => bulkSkip,
}))

function renderBulkActions(selectedHabitIds: Set<string>, readOnly = false) {
  const onSuccess = vi.fn()
  const settleBulkHabitResolutions = vi.fn()
  const habitListRef = {
    current: { settleBulkHabitResolutions },
  } as unknown as React.RefObject<HabitListHandle | null>

  const { result } = renderHook(() =>
    useBulkActions({
      selectedHabitIds,
      selectedDateStr: VIEWED_DATE,
      readOnly,
      habitListRef,
      onSuccess,
    }),
  )

  return { result, onSuccess, settleBulkHabitResolutions }
}

function bulkSuccess(ids: string[]) {
  return { results: ids.map((habitId) => ({ habitId, status: 'Success' as const })) }
}

/**
 * Ticket #42 is the product authority: a confirmation belongs to an
 * irreversible act only. Bulk log and bulk skip act at once, and only bulk
 * delete asks. These assertions state that requirement rather than inherit it.
 */
describe('useBulkActions reversibility boundary', () => {
  beforeEach(() => {
    bulkDelete.mutateAsync.mockReset().mockResolvedValue(undefined)
    bulkLog.mutateAsync.mockReset().mockResolvedValue(bulkSuccess(['h-1', 'h-2']))
    bulkSkip.mutateAsync.mockReset().mockResolvedValue(bulkSuccess(['h-1', 'h-2']))
  })

  it('skips the selection on the viewed historical date with no confirmation state to clear', async () => {
    const { result, onSuccess, settleBulkHabitResolutions } = renderBulkActions(
      new Set(['h-1', 'h-2']),
    )

    expect(result.current).not.toHaveProperty('showBulkSkipConfirm')

    await act(async () => {
      await result.current.confirmBulkSkip()
    })

    expect(bulkSkip.mutateAsync).toHaveBeenCalledWith([
      { habitId: 'h-1', date: VIEWED_DATE },
      { habitId: 'h-2', date: VIEWED_DATE },
    ])
    expect(settleBulkHabitResolutions).toHaveBeenCalledWith([
      { habitId: 'h-1', mode: 'skip' },
      { habitId: 'h-2', mode: 'skip' },
    ])
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('logs the selection on the viewed historical date with no confirmation state to clear', async () => {
    const { result, onSuccess, settleBulkHabitResolutions } = renderBulkActions(
      new Set(['h-1', 'h-2']),
    )

    expect(result.current).not.toHaveProperty('showBulkLogConfirm')

    await act(async () => {
      await result.current.confirmBulkLog()
    })

    expect(bulkLog.mutateAsync).toHaveBeenCalledWith([
      { habitId: 'h-1', date: VIEWED_DATE },
      { habitId: 'h-2', date: VIEWED_DATE },
    ])
    expect(settleBulkHabitResolutions).toHaveBeenCalledWith([
      { habitId: 'h-1', mode: 'log' },
      { habitId: 'h-2', mode: 'log' },
    ])
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('keeps the confirmation for the irreversible bulk delete', async () => {
    const { result } = renderBulkActions(new Set(['h-1']))

    expect(result.current.showBulkDeleteConfirm).toBe(false)

    act(() => {
      result.current.setShowBulkDeleteConfirm(true)
    })
    expect(result.current.showBulkDeleteConfirm).toBe(true)
    expect(bulkDelete.mutateAsync).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.confirmBulkDelete()
    })
    expect(bulkDelete.mutateAsync).toHaveBeenCalledWith(['h-1'])
    expect(result.current.showBulkDeleteConfirm).toBe(false)
  })

  it('refuses log, skip, and delete mutations on a read-only date', async () => {
    const { result, onSuccess, settleBulkHabitResolutions } = renderBulkActions(
      new Set(['h-1']),
      true,
    )

    await act(async () => {
      await result.current.confirmBulkLog()
      await result.current.confirmBulkSkip()
      await result.current.confirmBulkDelete()
    })

    expect(bulkLog.mutateAsync).not.toHaveBeenCalled()
    expect(bulkSkip.mutateAsync).not.toHaveBeenCalled()
    expect(bulkDelete.mutateAsync).not.toHaveBeenCalled()
    expect(settleBulkHabitResolutions).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
