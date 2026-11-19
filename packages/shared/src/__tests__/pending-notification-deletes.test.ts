import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FAILED_DELETE_NOTICE_LIFE_MS,
  cancelPendingNotificationDelete,
  clearPendingNotificationDeletes,
  clearFailedNotificationDeletes,
  dismissFailedNotificationDelete,
  dismissNotificationDeleteNotices,
  dismissPendingNotificationDeleteNotice,
  getFailedNotificationDeleteIdsSnapshot,
  getNotificationDeleteNoticeSnapshot,
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

  it('never publishes a snapshot holding one delete as pending and failed at once', () => {
    const snapshots: Array<[string[], string[]]> = []
    const unsubscribe = subscribePendingNotificationDeleteIds(() => {
      snapshots.push([getPendingNotificationDeleteIdsSnapshot(), getFailedNotificationDeleteIdsSnapshot()])
    })
    queuePendingNotificationDelete('notif-1', () => {
      throw new Error('boom')
    })

    vi.advanceTimersByTime(5000)
    unsubscribe()

    expect(snapshots).toEqual([
      [['notif-1'], []],
      [[], []],
      [[], ['notif-1']],
    ])
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

  it('keeps a failed delete retryable while its notice is still live', async () => {
    const execute = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined)
    queuePendingNotificationDelete('notif-1', execute)

    await vi.advanceTimersByTimeAsync(5000)
    await vi.advanceTimersByTimeAsync(9000)

    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual(['notif-1'])
    expect(retryFailedNotificationDelete('notif-1')).toBe(true)
  })

  it('keeps a failed delete until its notice dismisses it', async () => {
    const subscriber = vi.fn()
    queuePendingNotificationDelete('notif-1', () => Promise.reject(new Error('boom')))

    await vi.advanceTimersByTimeAsync(5000)
    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual(['notif-1'])
    const unsubscribe = subscribePendingNotificationDeleteIds(subscriber)

    await vi.advanceTimersByTimeAsync(FAILED_DELETE_NOTICE_LIFE_MS - 1)
    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual(['notif-1'])

    expect(dismissFailedNotificationDelete('notif-1')).toBe(true)
    unsubscribe()

    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual([])
    expect(subscriber).toHaveBeenCalledTimes(1)
    expect(retryFailedNotificationDelete('notif-1')).toBe(false)
  })

  it('reports nothing dismissed when the notice names an unknown delete', () => {
    expect(dismissFailedNotificationDelete('notif-unknown')).toBe(false)
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
  it('reports a new in-flight failure after existing notices are dismissed', async () => {
    let rejectDelete!: (error: Error) => void
    const request = new Promise<never>((_resolve, reject) => { rejectDelete = reject })
    queuePendingNotificationDelete('in-flight', () => request)
    vi.advanceTimersByTime(5000)
    dismissNotificationDeleteNotices()
    rejectDelete(new Error('Unavailable'))
    await Promise.resolve()
    await Promise.resolve()
    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual(['in-flight'])
  })

  it('offers one notice that follows the newest delete and never returns an older one', () => {
    queuePendingNotificationDelete('first', vi.fn())
    queuePendingNotificationDelete('second', vi.fn())
    queuePendingNotificationDelete('third', vi.fn())
    expect(getNotificationDeleteNoticeSnapshot()).toEqual({ kind: 'pending', id: 'third' })
    expect(getNotificationDeleteNoticeSnapshot()).toBe(getNotificationDeleteNoticeSnapshot())

    cancelPendingNotificationDelete('third')
    expect(getNotificationDeleteNoticeSnapshot()).toBeNull()
    expect(getPendingNotificationDeleteIdsSnapshot()).toEqual(['first', 'second'])
  })

  it('ignores a dismissal for a delete that no longer owns the notice', () => {
    queuePendingNotificationDelete('first', vi.fn())
    queuePendingNotificationDelete('second', vi.fn())
    dismissPendingNotificationDeleteNotice('first')
    expect(getNotificationDeleteNoticeSnapshot()).toEqual({ kind: 'pending', id: 'second' })
    dismissPendingNotificationDeleteNotice('second')
    expect(getNotificationDeleteNoticeSnapshot()).toBeNull()
  })

  it('never gives the toast back to an older failed delete when a newer delete ends', () => {
    queuePendingNotificationDelete('a', () => { throw new Error('boom') })
    vi.advanceTimersByTime(5000)
    expect(getNotificationDeleteNoticeSnapshot()).toEqual({ kind: 'failed', id: 'a' })

    queuePendingNotificationDelete('b', vi.fn())
    expect(getNotificationDeleteNoticeSnapshot()).toEqual({ kind: 'pending', id: 'b' })
    cancelPendingNotificationDelete('b')
    expect(getNotificationDeleteNoticeSnapshot()).toBeNull()

    queuePendingNotificationDelete('c', vi.fn())
    vi.advanceTimersByTime(5000)
    expect(getNotificationDeleteNoticeSnapshot()).toBeNull()
  })

  it('shows the newest failed delete when two deletes fail', () => {
    queuePendingNotificationDelete('a', () => { throw new Error('boom') })
    queuePendingNotificationDelete('b', () => { throw new Error('boom') })
    vi.advanceTimersByTime(5000)
    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual(['a', 'b'])
    expect(getNotificationDeleteNoticeSnapshot()).toEqual({ kind: 'failed', id: 'b' })
    expect(retryFailedNotificationDelete('b')).toBe(true)
    expect(getNotificationDeleteNoticeSnapshot()).toEqual({ kind: 'pending', id: 'b' })
  })

  it('keeps a pending undo when an older delete fails behind it', () => {
    queuePendingNotificationDelete('a', () => { throw new Error('boom') })
    vi.advanceTimersByTime(3000)
    queuePendingNotificationDelete('b', vi.fn())
    vi.advanceTimersByTime(2000)
    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual(['a'])
    expect(getNotificationDeleteNoticeSnapshot()).toEqual({ kind: 'pending', id: 'b' })
  })

  it('ends a failed delete whose toast was replaced when its own life is over', () => {
    queuePendingNotificationDelete('a', () => { throw new Error('boom') })
    vi.advanceTimersByTime(5000)
    queuePendingNotificationDelete('b', vi.fn())
    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual(['a'])

    vi.advanceTimersByTime(FAILED_DELETE_NOTICE_LIFE_MS - 1)
    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual(['a'])
    vi.advanceTimersByTime(1)
    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual([])
    expect(retryFailedNotificationDelete('a')).toBe(false)
  })

  it('leaves the life of the failed toast to the toast and ends it when it loses the toast', () => {
    queuePendingNotificationDelete('a', () => { throw new Error('boom') })
    vi.advanceTimersByTime(5000)
    vi.advanceTimersByTime(FAILED_DELETE_NOTICE_LIFE_MS * 2)
    expect(getNotificationDeleteNoticeSnapshot()).toEqual({ kind: 'failed', id: 'a' })
    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual(['a'])

    queuePendingNotificationDelete('b', vi.fn())
    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual([])
    expect(getNotificationDeleteNoticeSnapshot()).toEqual({ kind: 'pending', id: 'b' })
  })

  it('clears a live pending owner when the notices are dismissed and keeps the delete pending', () => {
    queuePendingNotificationDelete('a', vi.fn())
    expect(getNotificationDeleteNoticeSnapshot()).toEqual({ kind: 'pending', id: 'a' })

    dismissNotificationDeleteNotices()

    expect(getNotificationDeleteNoticeSnapshot()).toBeNull()
    expect(getPendingNotificationDeleteIdsSnapshot()).toEqual(['a'])
  })

  it('ends a failed entry at once when the same delete is queued again', () => {
    queuePendingNotificationDelete('a', () => { throw new Error('boom') })
    vi.advanceTimersByTime(5000)
    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual(['a'])

    queuePendingNotificationDelete('a', vi.fn())

    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual([])
    expect(getNotificationDeleteNoticeSnapshot()).toEqual({ kind: 'pending', id: 'a' })
  })

  it('ends a failed delete that is not out of life when the notices are dismissed', () => {
    queuePendingNotificationDelete('a', () => { throw new Error('boom') })
    vi.advanceTimersByTime(5000)
    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual(['a'])

    dismissNotificationDeleteNotices()

    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual([])
    expect(getNotificationDeleteNoticeSnapshot()).toBeNull()
  })

  it('ignores a late pending dismissal for a delete that already failed and owns the toast', () => {
    queuePendingNotificationDelete('a', () => { throw new Error('boom') })
    vi.advanceTimersByTime(5000)

    dismissPendingNotificationDeleteNotice('a')

    expect(getNotificationDeleteNoticeSnapshot()).toEqual({ kind: 'failed', id: 'a' })
    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual(['a'])
  })

  it('ends an older failed delete at its life while the newest failed delete keeps the toast', () => {
    queuePendingNotificationDelete('a', () => { throw new Error('boom') })
    vi.advanceTimersByTime(3000)
    queuePendingNotificationDelete('b', () => { throw new Error('boom') })
    vi.advanceTimersByTime(2000)
    vi.advanceTimersByTime(3000)
    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual(['a', 'b'])
    expect(getNotificationDeleteNoticeSnapshot()).toEqual({ kind: 'failed', id: 'b' })

    vi.advanceTimersByTime(FAILED_DELETE_NOTICE_LIFE_MS - 3000)

    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual(['b'])
    expect(getNotificationDeleteNoticeSnapshot()).toEqual({ kind: 'failed', id: 'b' })
  })

  it('tells subscribers when a failed delete that lost the toast ends at its life', () => {
    const subscriber = vi.fn()
    queuePendingNotificationDelete('a', () => { throw new Error('boom') })
    vi.advanceTimersByTime(5000)
    queuePendingNotificationDelete('b', vi.fn())
    cancelPendingNotificationDelete('b')
    const unsubscribe = subscribePendingNotificationDeleteIds(subscriber)

    vi.advanceTimersByTime(FAILED_DELETE_NOTICE_LIFE_MS - 1)
    expect(subscriber).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    unsubscribe()

    expect(subscriber).toHaveBeenCalledTimes(1)
  })

  it('sends no update from the life timer of a failed delete that its notice dismissed', () => {
    const subscriber = vi.fn()
    queuePendingNotificationDelete('a', () => { throw new Error('boom') })
    vi.advanceTimersByTime(5000)
    dismissFailedNotificationDelete('a')
    const unsubscribe = subscribePendingNotificationDeleteIds(subscriber)

    vi.advanceTimersByTime(FAILED_DELETE_NOTICE_LIFE_MS * 2)
    unsubscribe()

    expect(subscriber).not.toHaveBeenCalled()
  })

  it('sends no update from the life timer of a failed delete that a session end cleared', () => {
    const subscriber = vi.fn()
    queuePendingNotificationDelete('a', () => { throw new Error('boom') })
    vi.advanceTimersByTime(5000)
    clearPendingNotificationDeletes()
    const unsubscribe = subscribePendingNotificationDeleteIds(subscriber)

    vi.advanceTimersByTime(FAILED_DELETE_NOTICE_LIFE_MS * 2)
    unsubscribe()

    expect(subscriber).not.toHaveBeenCalled()
  })

  it('clears a failed delete in a bulk clear when no attempt is in flight', () => {
    queuePendingNotificationDelete('a', () => { throw new Error('boom') })
    vi.advanceTimersByTime(5000)
    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual(['a'])

    clearFailedNotificationDeletes()

    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual([])
    expect(getNotificationDeleteNoticeSnapshot()).toBeNull()
  })

  it('sends no update from a bulk clear with nothing to clear', async () => {
    const subscriber = vi.fn()
    queuePendingNotificationDelete('a', () => Promise.resolve())
    await vi.advanceTimersByTimeAsync(5000)
    const unsubscribe = subscribePendingNotificationDeleteIds(subscriber)

    clearFailedNotificationDeletes()
    unsubscribe()

    expect(subscriber).not.toHaveBeenCalled()
  })

  it('keeps a re-queued delete out of the failed list when its first attempt fails late', async () => {
    let rejectFirstAttempt!: (error: Error) => void
    const firstAttempt = new Promise<never>((_resolve, reject) => { rejectFirstAttempt = reject })
    queuePendingNotificationDelete('a', () => firstAttempt)
    await vi.advanceTimersByTimeAsync(5000)

    expect(queuePendingNotificationDelete('a', vi.fn())).toBe(true)
    rejectFirstAttempt(new Error('late failure'))
    await Promise.resolve()
    await Promise.resolve()

    expect(getFailedNotificationDeleteIdsSnapshot()).toEqual([])
    expect(getPendingNotificationDeleteIdsSnapshot()).toEqual(['a'])
    expect(getNotificationDeleteNoticeSnapshot()).toEqual({ kind: 'pending', id: 'a' })
  })

  const failA = () => {
    queuePendingNotificationDelete('a', () => { throw new Error('boom') })
    vi.advanceTimersByTime(5000)
  }
  const queueA = () => { queuePendingNotificationDelete('a', vi.fn()) }
  it.each<[string, () => void, () => unknown, number]>([
    ['a queued delete', () => {}, () => queuePendingNotificationDelete('a', vi.fn()), 1],
    ['a cancelled delete', queueA, () => cancelPendingNotificationDelete('a'), 1],
    ['a dismissed pending notice', queueA, () => dismissPendingNotificationDeleteNotice('a'), 1],
    ['dismissed notices', queueA, () => dismissNotificationDeleteNotices(), 1],
    ['an undo window that ends', queueA, () => vi.advanceTimersByTime(5000), 1],
    ['a delete that fails when its window ends', () => { queuePendingNotificationDelete('a', () => { throw new Error('boom') }) },
      () => vi.advanceTimersByTime(5000), 2],
    ['a failed notice whose life ends', failA, () => vi.advanceTimersByTime(FAILED_DELETE_NOTICE_LIFE_MS), 1],
    ['a dismissed failed delete', failA, () => dismissFailedNotificationDelete('a'), 1],
    ['a retried failed delete', failA, () => retryFailedNotificationDelete('a'), 1],
    ['cleared failed deletes', failA, () => clearFailedNotificationDeletes(), 1],
    ['cleared pending deletes', queueA, () => clearPendingNotificationDeletes(), 1],
  ])('tells each subscriber about %s', (_name, setUp, change, calls) => {
    setUp()
    const subscriber = vi.fn()
    const unsubscribe = subscribePendingNotificationDeleteIds(subscriber)
    change()
    unsubscribe()
    expect(subscriber).toHaveBeenCalledTimes(calls)
  })
})
