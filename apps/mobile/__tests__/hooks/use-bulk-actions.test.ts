import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useBulkActions } from '@/hooks/use-bulk-actions'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { HabitListHandle } from '@/components/habit-list'

const TestRenderer = require('react-test-renderer')

const bulkDelete = { mutateAsync: vi.fn() }
const bulkLog = { mutateAsync: vi.fn() }
const bulkSkip = { mutateAsync: vi.fn() }
const showToast = vi.fn()

vi.mock('@/hooks/use-habits', () => ({
  useBulkDeleteHabits: () => bulkDelete,
  useBulkLogHabits: () => bulkLog,
  useBulkSkipHabits: () => bulkSkip,
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showToast }),
}))

type BulkActions = ReturnType<typeof useBulkActions>

function renderBulkActions(
  selectedHabitIds: Set<string>,
  habitsById = new Map<string, NormalizedHabit>(),
) {
  const onSuccess = vi.fn()
  const onPartialFailure = vi.fn()
  const markRecentlyCompleted = vi.fn()
  const checkAndPromptParentLog = vi.fn()
  const habitListRef = {
    current: { markRecentlyCompleted, checkAndPromptParentLog },
  } as unknown as React.RefObject<HabitListHandle | null>
  const captured: { current: BulkActions | null } = { current: null }
  function Probe() {
    captured.current = useBulkActions({ selectedHabitIds, habitsById, habitListRef, onSuccess, onPartialFailure })
    return null
  }
  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(Probe))
  })
  return { captured, onSuccess, onPartialFailure, markRecentlyCompleted, checkAndPromptParentLog }
}

function bulkSuccess(ids: string[]) {
  return { results: ids.map((habitId) => ({ habitId, status: 'Success' as const })) }
}

describe('useBulkActions confirmBulkDelete', () => {
  beforeEach(() => {
    showToast.mockReset()
    bulkDelete.mutateAsync.mockReset().mockResolvedValue(bulkSuccess(['h-1', 'h-2']))
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

  it('does not report success when the delete request rejects', async () => {
    bulkDelete.mutateAsync.mockRejectedValueOnce(new Error('offline'))
    const { captured, onSuccess } = renderBulkActions(new Set(['h-1']))

    await TestRenderer.act(async () => {
      await expect(captured.current!.confirmBulkDelete()).rejects.toThrow('offline')
    })

    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('keeps an offline-refused delete selected and reports that nothing changed', async () => {
    bulkDelete.mutateAsync.mockResolvedValueOnce({
      results: [],
      ambiguousIds: [],
      offlineFailureIds: ['h-1'],
    })
    const { captured, onSuccess, onPartialFailure } = renderBulkActions(new Set(['h-1']))

    await TestRenderer.act(async () => {
      await captured.current!.confirmBulkDelete()
    })

    expect(onPartialFailure).toHaveBeenCalledWith(['h-1'])
    expect(onSuccess).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith({
      kind: 'neutral',
      message: 'habits.bulkBar.offlineFailure',
    })
  })
})

/**
 * Ticket #42 is the product authority: a confirmation belongs to an
 * irreversible act only. Bulk log and bulk skip act at once, and only bulk
 * delete asks. These assertions state that requirement rather than inherit it.
 */
describe('useBulkActions reversibility boundary', () => {
  beforeEach(() => {
    showToast.mockReset()
    bulkDelete.mutateAsync.mockReset().mockResolvedValue(bulkSuccess(['h-1']))
    bulkLog.mutateAsync.mockReset().mockResolvedValue(bulkSuccess(['h-1', 'h-2']))
    bulkSkip.mutateAsync.mockReset().mockResolvedValue(bulkSuccess(['h-1', 'h-2']))
  })

  it('keeps failed rows selected and retries only those rows', async () => {
    bulkSkip.mutateAsync
      .mockResolvedValueOnce({ results: [
        { habitId: 'h-1', status: 'Success' },
        { habitId: 'h-2', status: 'Failed' },
      ] })
      .mockResolvedValueOnce(bulkSuccess(['h-2']))
    const { captured, onSuccess, onPartialFailure } = renderBulkActions(new Set(['h-1', 'h-2']))

    await TestRenderer.act(async () => { await captured.current!.confirmBulkSkip() })

    expect(onPartialFailure).toHaveBeenCalledWith(['h-2'])
    expect(onSuccess).not.toHaveBeenCalled()
    const retry = showToast.mock.calls[0]?.[0]?.onAction as (() => void) | undefined
    expect(retry).toBeTypeOf('function')
    await TestRenderer.act(async () => { retry?.(); await Promise.resolve() })
    expect(bulkSkip.mutateAsync).toHaveBeenLastCalledWith([{ habitId: 'h-2' }])
  })

  it('refreshes after an ambiguous skip without offering a retry', async () => {
    bulkSkip.mutateAsync.mockResolvedValueOnce({
      results: [{ habitId: 'h-1', status: 'Success' }],
      ambiguousIds: ['h-2'],
    })
    const { captured, onSuccess, onPartialFailure } = renderBulkActions(new Set(['h-1', 'h-2']))

    await TestRenderer.act(async () => { await captured.current!.confirmBulkSkip() })

    expect(showToast).toHaveBeenCalledWith({
      kind: 'neutral',
      message: 'habits.bulkBar.connectionRefreshed',
    })
    expect(showToast.mock.calls[0]?.[0]?.onAction).toBeUndefined()
    expect(onPartialFailure).not.toHaveBeenCalled()
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(bulkSkip.mutateAsync).toHaveBeenCalledTimes(1)
  })

  it('refreshes after an ambiguous bulk log without offering a retry', async () => {
    bulkLog.mutateAsync.mockResolvedValueOnce({
      results: [],
      ambiguousIds: ['h-1', 'h-2'],
      offlineFailureIds: [],
    })
    const { captured, onSuccess, onPartialFailure, markRecentlyCompleted } = renderBulkActions(
      new Set(['h-1', 'h-2']),
    )

    await TestRenderer.act(async () => { await captured.current!.confirmBulkLog() })

    expect(showToast).toHaveBeenCalledWith({
      kind: 'neutral',
      message: 'habits.bulkBar.connectionRefreshed',
    })
    expect(showToast.mock.calls[0]?.[0]?.onAction).toBeUndefined()
    expect(markRecentlyCompleted).not.toHaveBeenCalled()
    expect(onPartialFailure).not.toHaveBeenCalled()
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(bulkLog.mutateAsync).toHaveBeenCalledTimes(1)
  })

  it('keeps an offline-refused skip selected without reporting success or refresh', async () => {
    bulkSkip.mutateAsync.mockResolvedValueOnce({
      results: [],
      ambiguousIds: [],
      offlineFailureIds: ['h-1', 'h-2'],
    })
    const { captured, onSuccess, onPartialFailure, markRecentlyCompleted } = renderBulkActions(
      new Set(['h-1', 'h-2']),
    )

    await TestRenderer.act(async () => { await captured.current!.confirmBulkSkip() })

    expect(onPartialFailure).toHaveBeenCalledWith(['h-1', 'h-2'])
    expect(onSuccess).not.toHaveBeenCalled()
    expect(markRecentlyCompleted).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith({
      kind: 'neutral',
      message: 'habits.bulkBar.offlineFailure',
    })
    expect(showToast).not.toHaveBeenCalledWith(expect.objectContaining({
      message: 'habits.bulkBar.connectionRefreshed',
    }))
  })

  it('keeps offline-refused bulk logs selected and reports that nothing changed', async () => {
    bulkLog.mutateAsync.mockResolvedValueOnce({
      results: [],
      ambiguousIds: [],
      offlineFailureIds: ['h-1', 'h-2'],
    })
    const { captured, onSuccess, onPartialFailure, markRecentlyCompleted } = renderBulkActions(
      new Set(['h-1', 'h-2']),
    )

    await TestRenderer.act(async () => { await captured.current!.confirmBulkLog() })

    expect(onPartialFailure).toHaveBeenCalledWith(['h-1', 'h-2'])
    expect(onSuccess).not.toHaveBeenCalled()
    expect(markRecentlyCompleted).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith({
      kind: 'neutral',
      message: 'habits.bulkBar.offlineFailure',
    })
    expect(showToast.mock.calls[0]?.[0]?.onAction).toBeUndefined()
    expect(bulkLog.mutateAsync).toHaveBeenCalledTimes(1)
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

  it('deletes only selected roots so each request covers its server-side subtree', async () => {
    bulkDelete.mutateAsync.mockResolvedValueOnce(bulkSuccess(['parent']))
    const habitsById = new Map<string, NormalizedHabit>([
      ['parent', { id: 'parent', parentId: null } as NormalizedHabit],
      ['hidden-child', { id: 'hidden-child', parentId: 'parent' } as NormalizedHabit],
    ])
    const { captured } = renderBulkActions(
      new Set(['parent', 'hidden-child']),
      habitsById,
    )

    await TestRenderer.act(async () => {
      await captured.current!.confirmBulkDelete()
    })

    expect(bulkDelete.mutateAsync).toHaveBeenCalledWith(['parent'])
  })
})
