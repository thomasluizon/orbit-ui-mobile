import { useEffect, useState } from 'react'
import {
  getPushStatusToneClass,
  getWebPushStatusMessageKey,
  getWebPushStatusTone,
  type WebPushPermission,
  type WebPushPreferenceStatus,
} from '@orbit/shared/utils'
import {
  subscribePush as subscribePushAction,
  unsubscribePush as unsubscribePushAction,
  unsubscribePushForCleanup,
} from '@/lib/actions/notifications'
import { reportsAccountChanged } from '@/app/actions/action-result'
import { getAccountId, useAccountId } from '@/lib/account-scope'
import { getHeldAccountId } from '@/stores/auth-store'
import { withAccountIntent } from '@/lib/client-action'
import {
  getExistingPushSubscription,
  isPushSubscriptionOwner,
  recordPushSubscriptionOwner,
  releaseExistingPushSubscriptionOnServer,
  serializePushSubscriptionMutation,
  settlePushCleanupBeforeAbort,
} from '@/lib/push-subscription-owner'
import { getActiveServiceWorkerRegistration } from '@/lib/service-worker-registration'

/** `checking` covers the first render, before the browser reports its push support and subscription. */
export type PushPreferenceStatus = WebPushPreferenceStatus | 'checking'

export interface PushPreferenceSnapshot {
  supported: boolean
  subscribed: boolean
  permission: WebPushPermission
  status: PushPreferenceStatus
}

export interface UsePushNotificationPreferencesResult extends PushPreferenceSnapshot {
  loading: boolean
  togglePush: () => Promise<void>
}

function createCheckingSnapshot(): PushPreferenceSnapshot {
  return {
    supported: false,
    subscribed: false,
    permission: '',
    status: 'checking',
  }
}

function createUnsupportedSnapshot(): PushPreferenceSnapshot {
  return {
    supported: false,
    subscribed: false,
    permission: '',
    status: 'unsupported',
  }
}

function createSnapshot(
  permission: NotificationPermission,
  hasSubscription: boolean,
): PushPreferenceSnapshot {
  if (permission === 'denied') {
    return {
      supported: true,
      subscribed: false,
      permission,
      status: 'denied',
    }
  }

  const subscribed = permission === 'granted' && hasSubscription

  return {
    supported: true,
    subscribed,
    permission,
    status: subscribed ? 'registered' : 'not-registered',
  }
}

function createSyncFailedSnapshot(permission: NotificationPermission): PushPreferenceSnapshot {
  return {
    supported: true,
    subscribed: false,
    permission,
    status: permission === 'denied' ? 'denied' : 'sync-failed',
  }
}

export function isPushNotificationSupported(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    'Notification' in globalThis &&
    'serviceWorker' in navigator &&
    'PushManager' in globalThis
  )
}

export function getPushStatusTone(status: WebPushPreferenceStatus): string {
  return getPushStatusToneClass(getWebPushStatusTone(status))
}

export function getPushStatusMessageKey(
  status: WebPushPreferenceStatus,
  permission: WebPushPermission,
): string {
  return getWebPushStatusMessageKey(status, permission)
}

/** Reports registered only for the account that turned push on in this browser, never for an earlier one. */
export async function loadPushNotificationState(accountId: string): Promise<PushPreferenceSnapshot> {
  if (!isPushNotificationSupported()) {
    return createUnsupportedSnapshot()
  }

  const permission = Notification.permission

  if (permission === 'denied') {
    return createSnapshot(permission, false)
  }

  try {
    const registration = await getActiveServiceWorkerRegistration()
    const subscription = await registration.pushManager.getSubscription()

    return createSnapshot(permission, subscription !== null && isPushSubscriptionOwner(accountId))
  } catch {
    return createSyncFailedSnapshot(permission)
  }
}

export async function subscribeToPushNotifications(
  vapidKey: string | undefined = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  options: { reuseExisting?: boolean } = {},
): Promise<PushPreferenceSnapshot> {
  if (!isPushNotificationSupported()) {
    return createUnsupportedSnapshot()
  }

  if (!vapidKey) {
    throw new Error('Missing VAPID public key')
  }

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission()

  if (permission !== 'granted') {
    return createSnapshot(permission, false)
  }

  return serializePushSubscriptionMutation(async () => {
    const registration = await getActiveServiceWorkerRegistration()
    const existingSubscription = await registration.pushManager.getSubscription()

    const ownerAccountId = getAccountId()
    if (existingSubscription && !options.reuseExisting) {
      await releaseExistingPushSubscriptionOnServer(existingSubscription, ownerAccountId)
      await existingSubscription.unsubscribe()
    }

    const subscription = options.reuseExisting && existingSubscription ? existingSubscription : await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
    })

    try {
      await withAccountIntent(ownerAccountId, () => subscribePushAction(subscription.toJSON()))
    } catch (error) {
      if (subscription !== existingSubscription) await subscription.unsubscribe().catch(() => undefined)
      if (reportsAccountChanged(error)) throw error
      throw new Error('Failed to persist push subscription')
    }
    if (ownerAccountId) recordPushSubscriptionOwner(ownerAccountId)

    return createSnapshot(permission, true)
  })
}

export async function unsubscribeFromPushNotifications(
  permission: WebPushPermission,
): Promise<PushPreferenceSnapshot> {
  if (!isPushNotificationSupported()) {
    return createUnsupportedSnapshot()
  }

  return serializePushSubscriptionMutation(async () => {
    const registration = await getActiveServiceWorkerRegistration()
    const subscription = await registration.pushManager.getSubscription()

    if (subscription) {
      try {
        await unsubscribePushAction(subscription.toJSON())
      } catch (error) {
        if (reportsAccountChanged(error)) throw error
        await subscription.unsubscribe().catch(() => undefined)
        throw error
      }
      await subscription.unsubscribe().catch(() => undefined)
    }

    const nextPermission = permission || Notification.permission
    return createSnapshot(nextPermission, false)
  })
}

/**
 * Releases only the held account's endpoint. Cleanup has a deadline because it runs inside the cookie
 * lock, and uses a settling action failure mode instead of waiting for a UI reload (#994).
 */
export async function releasePushSubscription(accountId = getHeldAccountId()): Promise<void> {
  if (!accountId || !('serviceWorker' in navigator)) return
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('Push release timed out')), 5000)
  try {
    await serializePushSubscriptionMutation(async () => {
      const subscription = await getExistingPushSubscription()
      controller.signal.throwIfAborted()
      if (!subscription || !isPushSubscriptionOwner(accountId)) return
      try {
        await settlePushCleanupBeforeAbort(withAccountIntent(accountId,
          () => unsubscribePushForCleanup(subscription.toJSON())), controller.signal)
      } catch (error) {
        if (controller.signal.aborted || reportsAccountChanged(error)) throw error
        if (isPushSubscriptionOwner(accountId)) await subscription.unsubscribe()
        throw error
      }
      controller.signal.throwIfAborted()
      if (isPushSubscriptionOwner(accountId)) await subscription.unsubscribe()
    }, controller.signal)
  } finally {
    clearTimeout(timeout)
  }
}

export function usePushNotificationPreferences(): UsePushNotificationPreferencesResult {
  const accountId = useAccountId()
  const [loadedAccountId, setLoadedAccountId] = useState<string | null>(null)
  const [state, setState] = useState<UsePushNotificationPreferencesResult>({
    ...createCheckingSnapshot(),
    loading: false,
    togglePush: () => Promise.resolve(undefined),
  })

  useEffect(() => {
    if (accountId === null) return undefined
    let cancelled = false

    void loadPushNotificationState(accountId).then((snapshot) => {
      if (cancelled) {
        return
      }

      setLoadedAccountId(accountId)
      setState((current) => ({
        ...current,
        ...snapshot,
      }))
    })

    return () => {
      cancelled = true
    }
  }, [accountId])

  async function togglePush() {
    setState((current) => ({
      ...current,
      loading: true,
      status: current.subscribed ? current.status : 'requesting',
    }))

    try {
      const snapshot = state.subscribed
        ? await unsubscribeFromPushNotifications(state.permission)
        : await subscribeToPushNotifications()

      setState((current) => ({
        ...current,
        ...snapshot,
        loading: false,
      }))
    } catch (error) {
      if (reportsAccountChanged(error)) {
        setState((current) => ({ ...current, ...state, loading: false }))
        return
      }
      setState((current) => ({
        ...current,
        subscribed: false,
        loading: false,
        status: 'sync-failed',
      }))
    }
  }

  return {
    ...state,
    ...(loadedAccountId === accountId ? {} : createCheckingSnapshot()),
    togglePush,
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replaceAll('-', '+').replaceAll('_', '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.codePointAt(index) ?? 0
  }

  return outputArray
}
