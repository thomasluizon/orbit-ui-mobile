/**
 * A browser holds one push subscription for the whole origin, whichever account turned it on, and the
 * API sends to it until that account unsubscribes it. This key names that account, so a later account on
 * the same browser neither reads the subscription as its own nor keeps receiving its pushes. The value is
 * read only alongside a live subscription, so one left after an unsubscribe changes nothing.
 */
const PUSH_SUBSCRIPTION_OWNER_KEY = 'orbit_push_subscription_owner'

/** Keeps ownership, API persistence and browser mutations together across tabs. */
export function serializePushSubscriptionMutation<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!('locks' in navigator)) return Promise.reject(new Error('Web Locks API is required for push changes'))
  const result = navigator.locks.request('orbit-push-subscription', { signal }, operation)
  return signal ? settlePushCleanupBeforeAbort(result, signal) : result
}

/** Cancels cleanup's wait without letting its late continuation change a replacement account's endpoint. */
export async function settlePushCleanupBeforeAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  let abort: () => void = () => undefined
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => reject(new Error('Push cleanup cancelled', { cause: signal.reason }))
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
  try {
    return await Promise.race([operation, cancelled])
  } finally {
    signal.removeEventListener('abort', abort)
  }
}

export function recordPushSubscriptionOwner(accountId: string): void {
  localStorage.setItem(PUSH_SUBSCRIPTION_OWNER_KEY, accountId)
}

export function isPushSubscriptionOwner(accountId: string): boolean {
  return localStorage.getItem(PUSH_SUBSCRIPTION_OWNER_KEY) === accountId
}

/** Reads the subscription without registering the worker, so a browser that never turned push on stays untouched. */
export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null
  const registration = await navigator.serviceWorker.getRegistration()
  return registration ? registration.pushManager.getSubscription() : null
}

/**
 * Ends a subscription another account turned on, once `accountId` holds the session. Its owner's session
 * is gone, so only the browser side can end it; the API then deletes its row on the next send (410 Gone).
 */
export async function discardForeignPushSubscription(accountId: string): Promise<void> {
  return serializePushSubscriptionMutation(async () => {
    if (isPushSubscriptionOwner(accountId)) return
    const subscription = await getExistingPushSubscription()
    await subscription?.unsubscribe()
  })
}
