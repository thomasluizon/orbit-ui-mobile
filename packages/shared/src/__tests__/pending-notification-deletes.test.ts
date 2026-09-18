import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cancelPendingNotificationDelete,
  clearPendingNotificationDeletes,
  clearFailedNotificationDeletes,
  getFailedNotificationDeleteIdsSnapshot,
  getPendingNotificationDeleteIdsSnapshot,
  queuePendingNotificationDelete,
  resetPendingNotificationDeletesForTests,
  retryFailedNotificationDelete,
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

  it('retains a failed delete for a fresh retry after execution throws', () => {
    const execute = vi.fn(() => {
      throw new Error('boom')
    })
    queuePendingNotificationDelete('notif-1', execute)

    vi.advanceTimersByTime(5000)
    expect(getPendingNotificationDeleteIdsSnapshot()).toEqual([])
    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual(['notif-1'])

    expect(retryFailedNotificationDelete('notif-1')).toBe(true)
    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual([])
    expect(getPendingNotificationDeleteIdsSnapshot()).toEqual(['notif-1'])
    vi.advanceTimersByTime(5000)
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('captures an asynchronous rejection without leaking it', async () => {
    queuePendingNotificationDelete('notif-1', () => Promise.reject(new Error('boom')))

    await vi.advanceTimersByTimeAsync(5000)

    expect(getPendingNotificationDeleteIdsSnapshot()).toEqual([])
    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual(['notif-1'])
  })

  it('clears the failure after a repeated attempt succeeds', async () => {
    const execute = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined)
    queuePendingNotificationDelete('notif-1', execute)

    await vi.advanceTimersByTimeAsync(5000)
    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual(['notif-1'])

    retryFailedNotificationDelete('notif-1')
    await vi.advanceTimersByTimeAsync(5000)
    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual([])
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('ignores a late rejection after bulk clear supersedes the delete', async () => {
    let rejectDelete!: (error: Error) => void
    const deleteRequest = new Promise<never>((_resolve, reject) => { rejectDelete = reject })
    queuePendingNotificationDelete('notif-1', () => deleteRequest)

    await vi.advanceTimersByTimeAsync(5000)
    clearFailedNotificationDeletes()
    rejectDelete(new Error('stale failure'))
    await Promise.resolve()

    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual([])
  })

  it('cancels pending work and invalidates active and failed attempts when a session ends', async () => {
    let rejectActiveDelete!: (error: Error) => void
    const activeDeleteRequest = new Promise<never>((_resolve, reject) => {
      rejectActiveDelete = reject
    })
    const pendingDelete = vi.fn()
    queuePendingNotificationDelete('failed', () => { throw new Error('failed') })
    queuePendingNotificationDelete('active', () => activeDeleteRequest)
    await vi.advanceTimersByTimeAsync(5000)
    queuePendingNotificationDelete('pending', pendingDelete)

    clearPendingNotificationDeletes()
    rejectActiveDelete(new Error('late failure'))
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(5000)

    expect(getPendingNotificationDeleteIdsSnapshot()).toEqual([])
    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual([])
    expect(retryFailedNotificationDelete('failed')).toBe(false)
    expect(retryFailedNotificationDelete('active')).toBe(false)
    expect(pendingDelete).not.toHaveBeenCalled()
  })
})
