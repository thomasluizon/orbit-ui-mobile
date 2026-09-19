import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cancelPendingNotificationDelete,
  getFailedNotificationDeleteIdsSnapshot,
  getPendingNotificationDeleteIdsSnapshot,
  queuePendingNotificationDelete,
  resetPendingNotificationDeletesForTests,
  retryFailedNotificationDelete,
  subscribePendingNotificationDeleteIds,
} from '@/lib/pending-notification-deletes'

describe('web pending notification deletes', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetPendingNotificationDeletesForTests()
  })

  afterEach(() => {
    resetPendingNotificationDeletesForTests()
    vi.useRealTimers()
  })

  it('queues and executes deletes after the delay', async () => {
    const execute = vi.fn()
    const subscriber = vi.fn()
    const unsubscribe = subscribePendingNotificationDeleteIds(subscriber)

    expect(queuePendingNotificationDelete('notif-1', execute)).toBe(true)
    expect(getPendingNotificationDeleteIdsSnapshot()).toEqual(['notif-1'])

    await vi.advanceTimersByTimeAsync(5000)

    expect(execute).toHaveBeenCalledTimes(1)
    expect(getPendingNotificationDeleteIdsSnapshot()).toEqual([])
    expect(subscriber).toHaveBeenCalledTimes(2)

    unsubscribe()
  })

  it('prevents duplicate queues, supports cancellation, and resets pending entries', () => {
    const execute = vi.fn()

    expect(queuePendingNotificationDelete('notif-1', execute)).toBe(true)
    expect(queuePendingNotificationDelete('notif-1', execute)).toBe(false)
    expect(cancelPendingNotificationDelete('missing')).toBe(false)
    expect(cancelPendingNotificationDelete('notif-1')).toBe(true)

    queuePendingNotificationDelete('notif-2', execute)
    resetPendingNotificationDeletesForTests()

    expect(getPendingNotificationDeleteIdsSnapshot()).toEqual([])
    expect(execute).not.toHaveBeenCalled()
  })

  it('exposes a rejected delayed delete and requeues it for retry', async () => {
    const execute = vi.fn()
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce(undefined)
    queuePendingNotificationDelete('notif-1', execute)

    await vi.advanceTimersByTimeAsync(5000)
    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual(['notif-1'])
    expect(retryFailedNotificationDelete('notif-1')).toBe(true)
    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual([])

    await vi.advanceTimersByTimeAsync(5000)
    expect(execute).toHaveBeenCalledTimes(2)
    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual([])
  })
})
