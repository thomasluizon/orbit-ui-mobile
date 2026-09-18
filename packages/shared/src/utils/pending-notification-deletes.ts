type DelayedDeleteEntry = {
  execute: PendingDeleteExecutor
  timer: ReturnType<typeof setTimeout>
}

type PendingDeleteExecutor = () => unknown

const PENDING_DELETE_DELAY_MS = 5000

/**
 * How long a failed delayed delete keeps its notice and its retry. Twice the undo window, because a
 * failure is read and acted on rather than waited out, and bounded because the notice lives in the
 * authenticated shell: an entry with no life stacks one more line onto every route the person visits
 * for as long as the tab runs. When the life ends the notification is already back in the inbox, so
 * deleting it again is the same one action the retry was.
 *
 * The toast runs the clock rather than this module, because only the toast can see a pointer resting
 * on it or focus sitting inside it, and a timer that keeps running under either takes the retry away
 * from the person who is reaching for it.
 */
export const FAILED_DELETE_NOTICE_LIFE_MS = 10000

const pendingDeleteEntries = new Map<string, DelayedDeleteEntry>()
const failedDeleteEntries = new Map<string, PendingDeleteExecutor>()
const activeDeleteAttempts = new Map<string, symbol>()
const subscribers = new Set<() => void>()
let pendingDeleteSnapshot: string[] = []
let failedDeleteSnapshot: string[] = []

function syncPendingDeleteSnapshot(): void {
  pendingDeleteSnapshot = Array.from(pendingDeleteEntries.keys())
  failedDeleteSnapshot = Array.from(failedDeleteEntries.keys())
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

/** Returns failed delayed deletes that remain available for retry. */
export function getFailedNotificationDeleteIdsSnapshot(): string[] {
  return failedDeleteSnapshot
}

function takeFailedDelete(notificationId: string): PendingDeleteExecutor | null {
  const execute = failedDeleteEntries.get(notificationId)
  if (!execute) return null

  failedDeleteEntries.delete(notificationId)
  return execute
}

function reportFailedDelete(notificationId: string, execute: PendingDeleteExecutor): void {
  failedDeleteEntries.set(notificationId, execute)
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
  if (pendingDeleteEntries.has(notificationId)) {
    return false
  }

  takeFailedDelete(notificationId)
  activeDeleteAttempts.delete(notificationId)

  const timer = setTimeout(() => {
    const entry = pendingDeleteEntries.get(notificationId)
    if (!entry) return

    const attempt = Symbol(notificationId)
    activeDeleteAttempts.set(notificationId, attempt)

    try {
      const result = entry.execute()
      void Promise.resolve(result).then(
        () => finishDeleteAttempt(notificationId, attempt, execute, false),
        () => finishDeleteAttempt(notificationId, attempt, execute, true),
      )
    } catch {
      finishDeleteAttempt(notificationId, attempt, execute, true)
    } finally {
      pendingDeleteEntries.delete(notificationId)
      syncPendingDeleteSnapshot()
      emitPendingDeleteChange()
    }
  }, PENDING_DELETE_DELAY_MS)

  pendingDeleteEntries.set(notificationId, { execute, timer })
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

  syncPendingDeleteSnapshot()
  emitPendingDeleteChange()
  return queuePendingNotificationDelete(notificationId, execute)
}

/** Supersedes delayed-delete failures and active attempts before a bulk clear. */
export function clearFailedNotificationDeletes(): void {
  if (failedDeleteEntries.size === 0 && activeDeleteAttempts.size === 0) return
  failedDeleteEntries.clear()
  activeDeleteAttempts.clear()
  syncPendingDeleteSnapshot()
  emitPendingDeleteChange()
}

/**
 * Cancels a queued notification delete before it executes.
 * Returns false when no delete was pending for the id.
 */
export function cancelPendingNotificationDelete(notificationId: string): boolean {
  const entry = pendingDeleteEntries.get(notificationId)
  if (!entry) {
    return false
  }

  clearTimeout(entry.timer)
  pendingDeleteEntries.delete(notificationId)
  syncPendingDeleteSnapshot()
  emitPendingDeleteChange()
  return true
}

function clearPendingNotificationDeleteState(): void {
  for (const entry of pendingDeleteEntries.values()) {
    clearTimeout(entry.timer)
  }

  pendingDeleteEntries.clear()
  failedDeleteEntries.clear()
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
