import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBulkActions } from '@/hooks/use-bulk-actions'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { HabitListHandle } from '@/components/habits/habit-list'

const bulkDelete = { mutateAsync: vi.fn() }
const bulkLog = { mutateAsync: vi.fn() }
const bulkSkip = { mutateAsync: vi.fn() }
const showToast = vi.fn()
const showQueued = vi.fn()
const VIEWED_DATE = '2026-04-01'

vi.mock('@/hooks/use-habits', () => ({
  useBulkDeleteHabits: () => bulkDelete,
  useBulkLogHabits: () => bulkLog,
  useBulkSkipHabits: () => bulkSkip,
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showToast, showQueued }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

function renderBulkActions(
  selectedHabitIds: Set<string>,
  readOnly = false,
  habitsById = new Map<string, NormalizedHabit>(),
) {
  const onSuccess = vi.fn()
  const onPartialFailure = vi.fn()
  const settleBulkHabitResolutions = vi.fn()
  const habitListRef = {
    current: { settleBulkHabitResolutions },
  } as unknown as React.RefObject<HabitListHandle | null>

  const { result } = renderHook(() =>
    useBulkActions({
      selectedHabitIds,
      selectedDateStr: VIEWED_DATE,
      readOnly,
      habitsById,
      habitListRef,
      onSuccess,
      onPartialFailure,
    }),
  )

  return { result, onSuccess, onPartialFailure, settleBulkHabitResolutions }
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
    showToast.mockReset()
    showQueued.mockReset()
    bulkDelete.mutateAsync.mockReset().mockResolvedValue(bulkSuccess(['h-1']))
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

  it('retries only failed rows and keeps them selected', async () => {
    bulkLog.mutateAsync
      .mockResolvedValueOnce({
        results: [
          { habitId: 'h-1', status: 'Success' },
          { habitId: 'h-2', status: 'Failed' },
        ],
      })
      .mockResolvedValueOnce(bulkSuccess(['h-2']))
    const { result, onPartialFailure } = renderBulkActions(new Set(['h-1', 'h-2']))

    await act(async () => {
      await result.current.confirmBulkLog()
    })

    expect(onPartialFailure).toHaveBeenCalledWith(['h-2'])
    const retry = showQueued.mock.calls[0]?.[2] as (() => void) | undefined
    expect(retry).toBeTypeOf('function')
    await act(async () => {
      retry?.()
      await Promise.resolve()
    })
    expect(bulkLog.mutateAsync).toHaveBeenLastCalledWith([
      { habitId: 'h-2', date: VIEWED_DATE },
    ])
  })

  it('deletes only selected roots so one request covers each server-side subtree', async () => {
    const habitsById = new Map<string, NormalizedHabit>([
      ['parent', { id: 'parent', parentId: null } as NormalizedHabit],
      ['child', { id: 'child', parentId: 'parent' } as NormalizedHabit],
    ])
    const { result } = renderBulkActions(new Set(['parent', 'child']), false, habitsById)

    await act(async () => {
      await result.current.confirmBulkDelete()
    })

    expect(bulkDelete.mutateAsync).toHaveBeenCalledWith(['parent'])
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
