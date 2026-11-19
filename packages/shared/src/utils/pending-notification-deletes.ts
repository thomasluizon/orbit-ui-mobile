type PendingDeleteExecutor = () => unknown

const PENDING_DELETE_DELAY_MS = 5000

/**
 * How long the failed delete toast stays before it dismisses itself. The toast owns this life,
 * so hover and focus can pause it. When the life ends the notification is already back in the
 * inbox, so deleting it again is the same one action the retry was.
 */
export const FAILED_DELETE_NOTICE_LIFE_MS = 10000

const pendingDeleteTimers = new Map<string, ReturnType<typeof setTimeout>>()
const activeDeleteAttempts = new Map<string, symbol>()
const subscribers = new Set<() => void>()
let pendingDeleteSnapshot: string[] = []
let noticeSnapshot: NotificationDeleteNoticeState | null = null

type NotificationDeleteNoticeState = { kind: 'pending' | 'failed'; id: string }

type NoticeOwner = { kind: 'pending'; id: string } | { kind: 'failed'; id: string; execute: PendingDeleteExecutor }

let noticeOwner: NoticeOwner | null = null

function syncPendingDeleteSnapshot(): void {
  if (noticeOwner?.kind === 'pending' && !pendingDeleteTimers.has(noticeOwner.id)) noticeOwner = null
  pendingDeleteSnapshot = Array.from(pendingDeleteTimers.keys())
  if (noticeOwner?.kind !== noticeSnapshot?.kind || noticeOwner?.id !== noticeSnapshot?.id) {
    noticeSnapshot = noticeOwner && { kind: noticeOwner.kind, id: noticeOwner.id }
  }
}

function emitPendingDeleteChange(): void {
  for (const subscriber of subscribers) {
    subscriber()
  }
}

/** Subscribes to pending-delete id changes; returns an unsubscribe function. */
export function subscribePendingNotificationDeleteIds(subscriber: () => void): () => void {
  subscribers.add(subscriber)

  return () => {
    subscribers.delete(subscriber)
  }
}

/** Returns the current pending-delete notification ids as a stable snapshot. */
export function getPendingNotificationDeleteIdsSnapshot(): string[] {
  return pendingDeleteSnapshot
}

/**
 * Returns the one delete toast to show, or null, as a stable snapshot. A queued delete takes the
 * toast from the old owner. A failure takes it too, but never from a pending undo. When the owner
 * ends, no older delete gets the toast back. Only a failed owner can be retried.
 */
export function getNotificationDeleteNoticeSnapshot(): NotificationDeleteNoticeState | null {
  return noticeSnapshot
}

export function dismissPendingNotificationDeleteNotice(notificationId: string): void {
  if (noticeOwner?.kind !== 'pending' || noticeOwner.id !== notificationId) return
  noticeOwner = null
  syncPendingDeleteSnapshot()
  emitPendingDeleteChange()
}

export function dismissNotificationDeleteNotices(): void {
  noticeOwner = null
  syncPendingDeleteSnapshot()
  emitPendingDeleteChange()
}

function takeFailedDelete(notificationId: string): PendingDeleteExecutor | null {
  if (noticeOwner?.kind !== 'failed' || noticeOwner.id !== notificationId) return null

  const { execute } = noticeOwner
  noticeOwner = null
  return execute
}

function reportFailedDelete(notificationId: string, execute: PendingDeleteExecutor): void {
  if (noticeOwner?.kind === 'pending') return

  noticeOwner = { kind: 'failed', id: notificationId, execute }
  syncPendingDeleteSnapshot()
  emitPendingDeleteChange()
}

function finishDeleteAttempt(
  notificationId: string,
  attempt: symbol,
  execute: PendingDeleteExecutor,
  failed: boolean,
): void {
  if (activeDeleteAttempts.get(notificationId) !== attempt) return
  activeDeleteAttempts.delete(notificationId)
  if (failed) reportFailedDelete(notificationId, execute)
}

/**
 * Queues a notification delete that executes after the undo window elapses.
 * Returns false when the notification already has a pending delete.
 */
export function queuePendingNotificationDelete(notificationId: string, execute: PendingDeleteExecutor): boolean {
  if (pendingDeleteTimers.has(notificationId)) {
    return false
  }

  activeDeleteAttempts.delete(notificationId)

  const timer = setTimeout(() => {
    const attempt = Symbol(notificationId)
    activeDeleteAttempts.set(notificationId, attempt)
    pendingDeleteTimers.delete(notificationId)
    syncPendingDeleteSnapshot()
    emitPendingDeleteChange()

    try {
      const result = execute()
      void Promise.resolve(result).then(
        () => finishDeleteAttempt(notificationId, attempt, execute, false),
        () => finishDeleteAttempt(notificationId, attempt, execute, true),
      )
    } catch {
      finishDeleteAttempt(notificationId, attempt, execute, true)
    }
  }, PENDING_DELETE_DELAY_MS)

  pendingDeleteTimers.set(notificationId, timer)
  noticeOwner = { kind: 'pending', id: notificationId }
  syncPendingDeleteSnapshot()
  emitPendingDeleteChange()
  return true
}

/** Drops a failed delayed delete once its notice has run out its life. */
export function dismissFailedNotificationDelete(notificationId: string): boolean {
  if (!takeFailedDelete(notificationId)) return false

  syncPendingDeleteSnapshot()
  emitPendingDeleteChange()
  return true
}

/** Requeues a failed delayed delete and starts a fresh undo window. */
export function retryFailedNotificationDelete(notificationId: string): boolean {
  const execute = takeFailedDelete(notificationId)
  if (!execute) return false

  return queuePendingNotificationDelete(notificationId, execute)
}

/** Supersedes delayed-delete failures and active attempts before a bulk clear. */
export function clearFailedNotificationDeletes(): void {
  if (noticeOwner?.kind !== 'failed' && activeDeleteAttempts.size === 0) return
  if (noticeOwner?.kind === 'failed') noticeOwner = null
  activeDeleteAttempts.clear()
  syncPendingDeleteSnapshot()
  emitPendingDeleteChange()
}

/**
 * Cancels a queued notification delete before it executes.
 * Returns false when no delete was pending for the id.
 */
export function cancelPendingNotificationDelete(notificationId: string): boolean {
  const timer = pendingDeleteTimers.get(notificationId)
  if (timer === undefined) {
    return false
  }

  clearTimeout(timer)
  pendingDeleteTimers.delete(notificationId)
  syncPendingDeleteSnapshot()
  emitPendingDeleteChange()
  return true
}

function clearPendingNotificationDeleteState(): void {
  for (const timer of pendingDeleteTimers.values()) {
    clearTimeout(timer)
  }

  pendingDeleteTimers.clear()
  noticeOwner = null
  activeDeleteAttempts.clear()
  syncPendingDeleteSnapshot()
  emitPendingDeleteChange()
}

/** Cancels and invalidates delayed deletes when the owning session ends. */
export function clearPendingNotificationDeletes(): void {
  clearPendingNotificationDeleteState()
}

/** Clears all pending deletes and timers; test-only escape hatch. */
export function resetPendingNotificationDeletesForTests(): void {
  clearPendingNotificationDeleteState()
}
