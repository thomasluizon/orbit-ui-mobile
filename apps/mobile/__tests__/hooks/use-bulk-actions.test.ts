import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useBulkActions } from '@/hooks/use-bulk-actions'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
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

function renderBulkActions(selectedHabitIds: Set<string>, habits: NormalizedHabit[] = []) {
  const onSuccess = vi.fn()
  const habitListRef = {
    current: { markRecentlyCompleted: vi.fn(), checkAndPromptParentLog: vi.fn() },
  } as unknown as React.RefObject<HabitListHandle | null>
  const habitsById = new Map(habits.map((habit) => [habit.id, habit]))
  const captured: { current: BulkActions | null } = { current: null }
  function Probe() {
    captured.current = useBulkActions({ selectedHabitIds, habitsById, habitListRef, onSuccess })
    return null
  }
  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(Probe))
  })
  return { captured, onSuccess }
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

  it('includes excluded descendants when deleting their selected parent', async () => {
    const habits = [
      createMockHabit({ id: 'parent', parentId: null }),
      createMockHabit({ id: 'child-a', parentId: 'parent' }),
      createMockHabit({ id: 'child-b', parentId: 'parent' }),
    ]
    const { captured } = renderBulkActions(new Set(['parent', 'child-b']), habits)

    await TestRenderer.act(async () => {
      await captured.current!.confirmBulkDelete()
    })

    expect(new Set(bulkDelete.mutateAsync.mock.calls[0]![0])).toEqual(
      new Set(['parent', 'child-a', 'child-b']),
    )
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
