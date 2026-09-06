import { focusManager, type QueryClient } from '@tanstack/query-core'
import { notificationKeys } from './keys'
import { NOTIFICATIONS_REFETCH_INTERVAL } from './options'

const consumers = new Map<QueryClient, Set<symbol>>()
let interval: ReturnType<typeof setInterval> | undefined
let unsubscribeFocus: (() => void) | undefined

function stopPolling(): void {
  if (interval === undefined) return
  clearInterval(interval)
  interval = undefined
}

function pollNotifications(): void {
  if (!focusManager.isFocused()) return
  consumers.forEach((_references, queryClient) => {
    void queryClient.invalidateQueries({ queryKey: notificationKeys.lists() })
  })
}

function synchronizeFocus(): void {
  if (!focusManager.isFocused()) {
    stopPolling()
    return
  }
  if (interval === undefined) {
    interval = setInterval(pollNotifications, NOTIFICATIONS_REFETCH_INTERVAL)
  }
}

export function attachNotificationPolling(queryClient: QueryClient): () => void {
  const references = consumers.get(queryClient) ?? new Set<symbol>()
  const reference = Symbol()
  references.add(reference)
  consumers.set(queryClient, references)

  if (!unsubscribeFocus) {
    unsubscribeFocus = focusManager.subscribe(() => {
      synchronizeFocus()
      pollNotifications()
    })
    synchronizeFocus()
  }

  return () => {
    references.delete(reference)
    if (references.size === 0) consumers.delete(queryClient)
    if (consumers.size > 0) return
    stopPolling()
    unsubscribeFocus?.()
    unsubscribeFocus = undefined
  }
}
