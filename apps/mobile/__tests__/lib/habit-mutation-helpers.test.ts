import { describe, expect, it, vi, beforeEach } from 'vitest'
import { gamificationKeys, goalKeys, habitKeys, profileKeys } from '@orbit/shared/query'
import { finalizeHabitMutation } from '@/lib/habit-mutation-helpers'

const mocks = vi.hoisted(() => ({
  isQueuedResult: vi.fn((value: unknown) => (
    typeof value === 'object' &&
    value !== null &&
    'queued' in value &&
    (value as { queued?: boolean }).queued === true
  )),
  refreshWidget: vi.fn(async () => {}),
}))

vi.mock('@/lib/offline-mutations', () => ({
  isQueuedResult: mocks.isQueuedResult,
}))

vi.mock('@/lib/orbit-widget', () => ({
  refreshWidget: mocks.refreshWidget,
}))

describe('finalizeHabitMutation', () => {
  beforeEach(() => {
    mocks.refreshWidget.mockClear()
  })

  it('skips invalidation for queued mutations', async () => {
    const queryClient = {
      invalidateQueries: vi.fn(async () => {}),
    }

    await finalizeHabitMutation(
      queryClient as never,
      { queued: true, queuedMutationId: 'offline-mutation-1' },
      null,
      {
        habitId: 'habit-1',
        includeGoals: true,
        includeProfile: true,
        includeGamification: true,
      },
    )

    expect(queryClient.invalidateQueries).not.toHaveBeenCalled()
    expect(mocks.refreshWidget).not.toHaveBeenCalled()
  })

  it('invalidates habit-related caches and refreshes the widget on success', async () => {
    const queryClient = {
      invalidateQueries: vi.fn(async () => {}),
    }

    await finalizeHabitMutation(
      queryClient as never,
      { ok: true },
      null,
      {
        habitId: 'habit-1',
        includeGoals: true,
        includeProfile: true,
        includeGamification: true,
      },
    )

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: habitKeys.lists() })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: habitKeys.summary('', ''),
    })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: habitKeys.detail('habit-1'),
    })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: goalKeys.lists() })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: profileKeys.all })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: gamificationKeys.all })
    expect(mocks.refreshWidget).toHaveBeenCalledTimes(1)
  })
})
