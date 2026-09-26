import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useBulkActions } from '@/hooks/use-bulk-actions'
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
  const habitListRef = {
    current: { settleBulkHabitResolutions: vi.fn() },
  } as unknown as React.RefObject<HabitListHandle | null>
  const captured: { current: BulkActions | null } = { current: null }
  function Probe() {
    captured.current = useBulkActions({
      selectedHabitIds,
      selectedDateStr: '2026-09-25',
      habitListRef,
      onSuccess,
    })
    return null
  }
  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(Probe))
  })
  return { captured, onSuccess, habitListRef }
}

describe('useBulkActions replay acknowledgement', () => {
  beforeEach(() => {
    bulkLog.mutateAsync.mockReset()
    bulkSkip.mutateAsync.mockReset()
  })

  it.each([
    ['log', bulkLog, 'confirmBulkLog'],
    ['skip', bulkSkip, 'confirmBulkSkip'],
  ] as const)('keeps queued bulk %s pending until the server confirms it', async (
    mode, mutation, action,
  ) => {
    mutation.mutateAsync.mockResolvedValueOnce({
      queued: true,
      queuedMutationId: 'mutation-1',
      results: [{ index: 0, status: 'Success', habitId: 'child' }],
    })
    const { captured, habitListRef } = renderBulkActions(new Set(['child']))

    await TestRenderer.act(async () => { await captured.current![action]() })

    expect(mutation.mutateAsync).toHaveBeenCalledWith([
      { habitId: 'child', date: '2026-09-25' },
    ])
    expect(habitListRef.current?.settleBulkHabitResolutions).not.toHaveBeenCalled()
  })

  it('settles only accepted bulk log items', async () => {
    bulkLog.mutateAsync.mockResolvedValueOnce({ results: [
      { index: 0, status: 'Success', habitId: 'accepted' },
      { index: 1, status: 'Failed', habitId: 'rejected' },
    ] })
    const { captured, habitListRef } = renderBulkActions(new Set(['accepted', 'rejected']))

    await TestRenderer.act(async () => { await captured.current!.confirmBulkLog() })

    expect(habitListRef.current?.settleBulkHabitResolutions).toHaveBeenCalledWith(
      [{ habitId: 'accepted', date: '2026-09-25' }],
      'log',
    )
  })
})

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

  it('sends only selected habits when deleting a parent with an excluded child', async () => {
    const { captured } = renderBulkActions(new Set(['parent', 'child-b']))

    await TestRenderer.act(async () => {
      await captured.current!.confirmBulkDelete()
    })

    expect(bulkDelete.mutateAsync).toHaveBeenCalledWith(['parent', 'child-b'])
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
