import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useBulkActions } from '@/hooks/use-bulk-actions'
import type { HabitListHandle } from '@/components/habit-list'

const TestRenderer = require('react-test-renderer')

const bulkDelete = { mutateAsync: vi.fn() }
const bulkLog = { mutateAsync: vi.fn() }
const bulkSkip = { mutateAsync: vi.fn() }
const VIEWED_DATE = '2026-04-01'

vi.mock('@/hooks/use-habits', () => ({
  useBulkDeleteHabits: () => bulkDelete,
  useBulkLogHabits: () => bulkLog,
  useBulkSkipHabits: () => bulkSkip,
}))

type BulkActions = ReturnType<typeof useBulkActions>

function renderBulkActions(selectedHabitIds: Set<string>) {
  const onSuccess = vi.fn()
  const settleBulkHabitResolutions = vi.fn()
  const habitListRef = {
    current: { settleBulkHabitResolutions },
  } as unknown as React.RefObject<HabitListHandle | null>
  const captured: { current: BulkActions | null } = { current: null }
  function Probe() {
    captured.current = useBulkActions({
      selectedHabitIds,
      selectedDateStr: VIEWED_DATE,
      habitListRef,
      onSuccess,
    })
    return null
  }
  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(Probe))
  })
  return { captured, onSuccess, settleBulkHabitResolutions }
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

  it('keeps the selection when an offline delete is refused', async () => {
    bulkDelete.mutateAsync.mockRejectedValueOnce(new Error('offline'))
    const { captured, onSuccess, settleBulkHabitResolutions } = renderBulkActions(new Set(['h-1']))

    await TestRenderer.act(async () => {
      await expect(captured.current!.confirmBulkDelete()).rejects.toThrow('offline')
    })

    expect(onSuccess).not.toHaveBeenCalled()
    expect(settleBulkHabitResolutions).not.toHaveBeenCalled()
    expect(captured.current!.showBulkDeleteConfirm).toBe(false)
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

  it('skips the selection on the viewed historical date with no confirmation state to clear', async () => {
    const { captured, onSuccess, settleBulkHabitResolutions } = renderBulkActions(
      new Set(['h-1', 'h-2']),
    )

    expect(Object.keys(captured.current!)).not.toContain('showBulkSkipConfirm')

    await TestRenderer.act(async () => {
      await captured.current!.confirmBulkSkip()
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
    const { captured, onSuccess, settleBulkHabitResolutions } = renderBulkActions(
      new Set(['h-1', 'h-2']),
    )

    expect(Object.keys(captured.current!)).not.toContain('showBulkLogConfirm')

    await TestRenderer.act(async () => {
      await captured.current!.confirmBulkLog()
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

  it.each([
    ['log', bulkLog, 'confirmBulkLog'],
    ['skip', bulkSkip, 'confirmBulkSkip'],
  ] as const)('keeps the selection when an offline bulk %s is refused', async (
    _mode,
    mutation,
    action,
  ) => {
    mutation.mutateAsync.mockRejectedValueOnce(new Error('offline'))
    const { captured, onSuccess, settleBulkHabitResolutions } = renderBulkActions(
      new Set(['h-1', 'h-2']),
    )

    await TestRenderer.act(async () => {
      await expect(captured.current![action]()).rejects.toThrow('offline')
    })

    expect(onSuccess).not.toHaveBeenCalled()
    expect(settleBulkHabitResolutions).not.toHaveBeenCalled()
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
