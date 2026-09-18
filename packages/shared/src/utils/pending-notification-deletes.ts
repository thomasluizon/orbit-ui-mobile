type PendingDeleteEntry = {
  execute: PendingDeleteExecutor
  timer: ReturnType<typeof setTimeout>
}

type PendingDeleteExecutor = () => unknown

const PENDING_DELETE_DELAY_MS = 5000
const pendingDeleteEntries = new Map<string, PendingDeleteEntry>()
const failedDeleteExecutors = new Map<string, PendingDeleteExecutor>()
const subscribers = new Set<() => void>()
let pendingDeleteSnapshot: string[] = []
let failedDeleteSnapshot: string[] = []

function syncPendingDeleteSnapshot(): void {
  pendingDeleteSnapshot = Array.from(pendingDeleteEntries.keys())
  failedDeleteSnapshot = Array.from(failedDeleteExecutors.keys())
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

function reportFailedDelete(notificationId: string, execute: PendingDeleteExecutor): void {
  failedDeleteExecutors.set(notificationId, execute)
  syncPendingDeleteSnapshot()
  emitPendingDeleteChange()
}

/**
 * Queues a notification delete that executes after the undo window elapses.
 * Returns false when the notification already has a pending delete.
 */
export function queuePendingNotificationDelete(notificationId: string, execute: PendingDeleteExecutor): boolean {
  if (pendingDeleteEntries.has(notificationId)) {
    return false
  }

  failedDeleteExecutors.delete(notificationId)

  const timer = setTimeout(() => {
    const entry = pendingDeleteEntries.get(notificationId)
    if (!entry) return

    try {
      const result = entry.execute()
      void Promise.resolve(result).catch(() => reportFailedDelete(notificationId, execute))
    } catch {
      reportFailedDelete(notificationId, execute)
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

/** Requeues a failed delayed delete and starts a fresh undo window. */
export function retryFailedNotificationDelete(notificationId: string): boolean {
  const execute = failedDeleteExecutors.get(notificationId)
  if (!execute) return false

  failedDeleteExecutors.delete(notificationId)
  syncPendingDeleteSnapshot()
  emitPendingDeleteChange()
  return queuePendingNotificationDelete(notificationId, execute)
}

/** Clears delayed-delete failures superseded by a successful bulk action. */
export function clearFailedNotificationDeletes(): void {
  if (failedDeleteExecutors.size === 0) return
  failedDeleteExecutors.clear()
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

/** Clears all pending deletes and timers; test-only escape hatch. */
export function resetPendingNotificationDeletesForTests(): void {
  for (const entry of pendingDeleteEntries.values()) {
    clearTimeout(entry.timer)
  }

  pendingDeleteEntries.clear()
  failedDeleteExecutors.clear()
  syncPendingDeleteSnapshot()
  emitPendingDeleteChange()
}
