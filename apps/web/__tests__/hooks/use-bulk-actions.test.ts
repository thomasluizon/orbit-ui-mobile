import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBulkActions } from '@/hooks/use-bulk-actions'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { HabitListHandle } from '@/components/habits/habit-list'

const bulkDelete = { mutateAsync: vi.fn() }
const bulkLog = { mutateAsync: vi.fn() }
const bulkSkip = { mutateAsync: vi.fn() }

vi.mock('@/hooks/use-habits', () => ({
  useBulkDeleteHabits: () => bulkDelete,
  useBulkLogHabits: () => bulkLog,
  useBulkSkipHabits: () => bulkSkip,
}))

function renderBulkActions(selectedHabitIds: Set<string>) {
  const onSuccess = vi.fn()
  const markRecentlyCompleted = vi.fn()
  const checkAndPromptParentLog = vi.fn()
  const habitListRef = {
    current: { markRecentlyCompleted, checkAndPromptParentLog },
  } as unknown as React.RefObject<HabitListHandle | null>
  const habitsById = new Map<string, NormalizedHabit>()

  const { result } = renderHook(() =>
    useBulkActions({ selectedHabitIds, habitsById, habitListRef, onSuccess }),
  )

  return { result, onSuccess, markRecentlyCompleted, checkAndPromptParentLog }
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

  it('skips the selection on one press, with no confirmation state to clear', async () => {
    const { result, onSuccess, markRecentlyCompleted } = renderBulkActions(
      new Set(['h-1', 'h-2']),
    )

    expect(result.current).not.toHaveProperty('showBulkSkipConfirm')

    await act(async () => {
      await result.current.confirmBulkSkip()
    })

    expect(bulkSkip.mutateAsync).toHaveBeenCalledWith([{ habitId: 'h-1' }, { habitId: 'h-2' }])
    expect(markRecentlyCompleted).toHaveBeenCalledTimes(2)
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('logs the selection on one press, with no confirmation state to clear', async () => {
    const { result, onSuccess } = renderBulkActions(new Set(['h-1', 'h-2']))

    expect(result.current).not.toHaveProperty('showBulkLogConfirm')

    await act(async () => {
      await result.current.confirmBulkLog()
    })

    expect(bulkLog.mutateAsync).toHaveBeenCalledWith([{ habitId: 'h-1' }, { habitId: 'h-2' }])
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('settles every top-level parent once a bulk skip lands', async () => {
    const { result, checkAndPromptParentLog } = renderBulkActions(new Set(['h-1', 'h-2']))

    await act(async () => {
      await result.current.confirmBulkSkip()
    })

    expect(checkAndPromptParentLog).toHaveBeenCalledTimes(2)
    expect(checkAndPromptParentLog).toHaveBeenCalledWith('h-1')
    expect(checkAndPromptParentLog).toHaveBeenCalledWith('h-2')
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
})
