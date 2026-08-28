import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useBulkActions } from '@/hooks/use-bulk-actions'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { HabitListHandle } from '@/components/habit-list'

const TestRenderer = require('react-test-renderer')

const bulkDelete = { mutateAsync: vi.fn() }
const bulkLog = { mutateAsync: vi.fn() }
const bulkSkip = { mutateAsync: vi.fn() }

vi.mock('@/hooks/use-habits', () => ({
  useBulkDeleteHabits: () => bulkDelete,
  useBulkLogHabits: () => bulkLog,
  useBulkSkipHabits: () => bulkSkip,
}))

type BulkActions = ReturnType<typeof useBulkActions>

function renderBulkActions(selectedHabitIds: Set<string>) {
  const onSuccess = vi.fn()
  const markRecentlyCompleted = vi.fn()
  const checkAndPromptParentLog = vi.fn()
  const habitListRef = {
    current: { markRecentlyCompleted, checkAndPromptParentLog },
  } as unknown as React.RefObject<HabitListHandle | null>
  const habitsById = new Map<string, NormalizedHabit>()
  const captured: { current: BulkActions | null } = { current: null }
  function Probe() {
    captured.current = useBulkActions({ selectedHabitIds, habitsById, habitListRef, onSuccess })
    return null
  }
  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(Probe))
  })
  return { captured, onSuccess, markRecentlyCompleted, checkAndPromptParentLog }
}

function bulkSuccess(ids: string[]) {
  return { results: ids.map((habitId) => ({ habitId, status: 'Success' as const })) }
}

describe('useBulkActions confirmBulkDelete', () => {
  beforeEach(() => {
    bulkDelete.mutateAsync.mockReset().mockResolvedValue(undefined)
  })

  it('deletes the selected habits then closes the confirm and reports success', async () => {
    const { captured, onSuccess } = renderBulkActions(new Set(['h-1', 'h-2']))

    await TestRenderer.act(async () => {
      await captured.current!.confirmBulkDelete()
    })

    expect(bulkDelete.mutateAsync).toHaveBeenCalledWith(['h-1', 'h-2'])
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(captured.current!.showBulkDeleteConfirm).toBe(false)
  })

  it('is a no-op when nothing is selected', async () => {
    const { captured, onSuccess } = renderBulkActions(new Set())

    await TestRenderer.act(async () => {
      await captured.current!.confirmBulkDelete()
    })

    expect(bulkDelete.mutateAsync).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('still reports success in the finally block when the delete rejects', async () => {
    bulkDelete.mutateAsync.mockRejectedValueOnce(new Error('offline'))
    const { captured, onSuccess } = renderBulkActions(new Set(['h-1']))

    await TestRenderer.act(async () => {
      await expect(captured.current!.confirmBulkDelete()).rejects.toThrow('offline')
    })

    expect(onSuccess).toHaveBeenCalledTimes(1)
  })
})

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
    const { captured, onSuccess, markRecentlyCompleted } = renderBulkActions(
      new Set(['h-1', 'h-2']),
    )

    expect(Object.keys(captured.current!)).not.toContain('showBulkSkipConfirm')

    await TestRenderer.act(async () => {
      await captured.current!.confirmBulkSkip()
    })

    expect(bulkSkip.mutateAsync).toHaveBeenCalledWith([{ habitId: 'h-1' }, { habitId: 'h-2' }])
    expect(markRecentlyCompleted).toHaveBeenCalledTimes(2)
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('logs the selection on one press, with no confirmation state to clear', async () => {
    const { captured, onSuccess } = renderBulkActions(new Set(['h-1', 'h-2']))

    expect(Object.keys(captured.current!)).not.toContain('showBulkLogConfirm')

    await TestRenderer.act(async () => {
      await captured.current!.confirmBulkLog()
    })

    expect(bulkLog.mutateAsync).toHaveBeenCalledWith([{ habitId: 'h-1' }, { habitId: 'h-2' }])
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('settles every top-level parent once a bulk skip lands', async () => {
    const { captured, checkAndPromptParentLog } = renderBulkActions(new Set(['h-1', 'h-2']))

    await TestRenderer.act(async () => {
      await captured.current!.confirmBulkSkip()
    })

    expect(checkAndPromptParentLog).toHaveBeenCalledTimes(2)
    expect(checkAndPromptParentLog).toHaveBeenCalledWith('h-1')
    expect(checkAndPromptParentLog).toHaveBeenCalledWith('h-2')
  })

  it('keeps the confirmation for the irreversible bulk delete', async () => {
    const { captured } = renderBulkActions(new Set(['h-1']))

    expect(captured.current!.showBulkDeleteConfirm).toBe(false)

    TestRenderer.act(() => {
      captured.current!.setShowBulkDeleteConfirm(true)
    })
    expect(captured.current!.showBulkDeleteConfirm).toBe(true)
    expect(bulkDelete.mutateAsync).not.toHaveBeenCalled()

    await TestRenderer.act(async () => {
      await captured.current!.confirmBulkDelete()
    })
    expect(bulkDelete.mutateAsync).toHaveBeenCalledWith(['h-1'])
    expect(captured.current!.showBulkDeleteConfirm).toBe(false)
  })
})
