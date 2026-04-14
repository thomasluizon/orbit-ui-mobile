type PendingDeleteEntry = {
  execute: () => void
  timer: ReturnType<typeof setTimeout>
}

const PENDING_DELETE_DELAY_MS = 5000
const pendingDeleteEntries = new Map<string, PendingDeleteEntry>()
const subscribers = new Set<() => void>()
let pendingDeleteSnapshot: string[] = []

function syncPendingDeleteSnapshot(): void {
  pendingDeleteSnapshot = Array.from(pendingDeleteEntries.keys())
}

function emitPendingDeleteChange(): void {
  for (const subscriber of subscribers) {
    subscriber()
  }
}

export function subscribePendingNotificationDeleteIds(subscriber: () => void): () => void {
  subscribers.add(subscriber)

  return () => {
    subscribers.delete(subscriber)
  }
}

export function getPendingNotificationDeleteIdsSnapshot(): string[] {
  return pendingDeleteSnapshot
}

export function queuePendingNotificationDelete(notificationId: string, execute: () => void): boolean {
  if (pendingDeleteEntries.has(notificationId)) {
    return false
  }

  const timer = setTimeout(() => {
    const entry = pendingDeleteEntries.get(notificationId)
    if (!entry) return

    try {
      entry.execute()
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

export function resetPendingNotificationDeletesForTests(): void {
  for (const entry of pendingDeleteEntries.values()) {
    clearTimeout(entry.timer)
  }

  pendingDeleteEntries.clear()
  syncPendingDeleteSnapshot()
  emitPendingDeleteChange()
}
