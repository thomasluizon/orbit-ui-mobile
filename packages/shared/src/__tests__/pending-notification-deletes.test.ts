import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cancelPendingNotificationDelete,
  getPendingNotificationDeleteIdsSnapshot,
  queuePendingNotificationDelete,
  resetPendingNotificationDeletesForTests,
  subscribePendingNotificationDeleteIds,
} from '../utils/pending-notification-deletes'

describe('pending notification deletes', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetPendingNotificationDeletesForTests()
  })

  afterEach(() => {
    resetPendingNotificationDeletesForTests()
    vi.useRealTimers()
  })

  it('executes a queued delete after the undo window elapses', () => {
    const execute = vi.fn()

    expect(queuePendingNotificationDelete('notif-1', execute)).toBe(true)
    expect(getPendingNotificationDeleteIdsSnapshot()).toEqual(['notif-1'])
    expect(execute).not.toHaveBeenCalled()

    vi.advanceTimersByTime(5000)

    expect(execute).toHaveBeenCalledTimes(1)
    expect(getPendingNotificationDeleteIdsSnapshot()).toEqual([])
  })

  it('rejects queueing the same notification twice', () => {
    const first = vi.fn()
    const second = vi.fn()

    expect(queuePendingNotificationDelete('notif-1', first)).toBe(true)
    expect(queuePendingNotificationDelete('notif-1', second)).toBe(false)

    vi.advanceTimersByTime(5000)

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })

  it('cancel prevents execution and reports whether a delete was pending', () => {
    const execute = vi.fn()
    queuePendingNotificationDelete('notif-1', execute)

    expect(cancelPendingNotificationDelete('notif-1')).toBe(true)
    expect(cancelPendingNotificationDelete('notif-1')).toBe(false)

    vi.advanceTimersByTime(5000)

    expect(execute).not.toHaveBeenCalled()
    expect(getPendingNotificationDeleteIdsSnapshot()).toEqual([])
  })

  it('notifies subscribers on queue, cancel, and execution', () => {
    const subscriber = vi.fn()
    const unsubscribe = subscribePendingNotificationDeleteIds(subscriber)

    queuePendingNotificationDelete('notif-1', vi.fn())
    expect(subscriber).toHaveBeenCalledTimes(1)

    cancelPendingNotificationDelete('notif-1')
    expect(subscriber).toHaveBeenCalledTimes(2)

    queuePendingNotificationDelete('notif-2', vi.fn())
    vi.advanceTimersByTime(5000)
    expect(subscriber).toHaveBeenCalledTimes(4)

    unsubscribe()
    queuePendingNotificationDelete('notif-3', vi.fn())
    expect(subscriber).toHaveBeenCalledTimes(4)
  })

  it('clears the pending id even when execution throws', () => {
    queuePendingNotificationDelete('notif-1', () => {
      throw new Error('boom')
    })

    expect(() => vi.advanceTimersByTime(5000)).toThrow('boom')
    expect(getPendingNotificationDeleteIdsSnapshot()).toEqual([])
  })
})
