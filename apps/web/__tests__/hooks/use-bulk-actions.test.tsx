import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { useBulkActions } from '@/hooks/use-bulk-actions'
import type { HabitListHandle } from '@/components/habits/habit-list'

const mutations = vi.hoisted(() => ({
  bulkDelete: vi.fn(),
  bulkLog: vi.fn(),
  bulkSkip: vi.fn(),
}))

vi.mock('@/hooks/use-habits', () => ({
  useBulkDeleteHabits: () => ({ mutateAsync: mutations.bulkDelete }),
  useBulkLogHabits: () => ({ mutateAsync: mutations.bulkLog }),
  useBulkSkipHabits: () => ({ mutateAsync: mutations.bulkSkip }),
}))

function renderBulkActions(selectedHabitIds: Set<string>, habits: NormalizedHabit[]) {
  return renderHook(() => useBulkActions({
    selectedHabitIds,
    habitsById: new Map(habits.map((habit) => [habit.id, habit])),
    habitListRef: { current: null } as React.RefObject<HabitListHandle | null>,
    onSuccess: vi.fn(),
  }))
}

describe('useBulkActions selection payloads', () => {
  beforeEach(() => {
    mutations.bulkDelete.mockReset().mockResolvedValue(undefined)
    mutations.bulkLog.mockReset().mockResolvedValue({ results: [] })
    mutations.bulkSkip.mockReset().mockResolvedValue({ results: [] })
  })

  it('includes excluded descendants when deleting a selected parent', async () => {
    const habits = [
      createMockHabit({ id: 'parent', parentId: null }),
      createMockHabit({ id: 'child-a', parentId: 'parent' }),
      createMockHabit({ id: 'child-b', parentId: 'parent' }),
    ]
    const { result } = renderBulkActions(new Set(['parent', 'child-b']), habits)

    await act(async () => { await result.current.confirmBulkDelete() })

    expect(new Set(mutations.bulkDelete.mock.calls[0]![0])).toEqual(
      new Set(['parent', 'child-a', 'child-b']),
    )
  })

  it('sends only selected habits to log and skip', async () => {
    const { result } = renderBulkActions(new Set(['parent', 'child-b']), [])

    await act(async () => { await result.current.confirmBulkLog() })
    await act(async () => { await result.current.confirmBulkSkip() })

    expect(mutations.bulkLog).toHaveBeenCalledWith([
      { habitId: 'parent' }, { habitId: 'child-b' },
    ])
    expect(mutations.bulkSkip).toHaveBeenCalledWith([
      { habitId: 'parent' }, { habitId: 'child-b' },
    ])
  })
})
