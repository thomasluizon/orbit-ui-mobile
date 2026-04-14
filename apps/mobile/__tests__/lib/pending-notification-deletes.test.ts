import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cancelPendingNotificationDelete,
  getPendingNotificationDeleteIdsSnapshot,
  queuePendingNotificationDelete,
  resetPendingNotificationDeletesForTests,
  subscribePendingNotificationDeleteIds,
} from '@/lib/pending-notification-deletes'

describe('pending notification deletes', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetPendingNotificationDeletesForTests()
  })

  afterEach(() => {
    resetPendingNotificationDeletesForTests()
    vi.useRealTimers()
  })

  it('queues deletes, exposes the snapshot, and executes them after the delay', async () => {
    const execute = vi.fn()
    const subscriber = vi.fn()
    const unsubscribe = subscribePendingNotificationDeleteIds(subscriber)

    expect(queuePendingNotificationDelete('notif-1', execute)).toBe(true)
    expect(getPendingNotificationDeleteIdsSnapshot()).toEqual(['notif-1'])
    expect(subscriber).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(5000)

    expect(execute).toHaveBeenCalledTimes(1)
    expect(getPendingNotificationDeleteIdsSnapshot()).toEqual([])
    expect(subscriber).toHaveBeenCalledTimes(2)

    unsubscribe()
  })

  it('prevents duplicate queued deletes and supports cancellation', () => {
    const execute = vi.fn()

    expect(queuePendingNotificationDelete('notif-1', execute)).toBe(true)
    expect(queuePendingNotificationDelete('notif-1', execute)).toBe(false)
    expect(getPendingNotificationDeleteIdsSnapshot()).toEqual(['notif-1'])

    expect(cancelPendingNotificationDelete('notif-1')).toBe(true)
    expect(cancelPendingNotificationDelete('notif-1')).toBe(false)
    expect(getPendingNotificationDeleteIdsSnapshot()).toEqual([])
    expect(execute).not.toHaveBeenCalled()
  })

  it('clears pending deletes and notifies subscribers during reset', () => {
    const subscriber = vi.fn()
    subscribePendingNotificationDeleteIds(subscriber)
    queuePendingNotificationDelete('notif-1', vi.fn())
    queuePendingNotificationDelete('notif-2', vi.fn())

    resetPendingNotificationDeletesForTests()

    expect(getPendingNotificationDeleteIdsSnapshot()).toEqual([])
    expect(subscriber).toHaveBeenCalledTimes(3)
  })
})
