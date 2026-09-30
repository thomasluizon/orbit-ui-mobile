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
} from '@/lib/actions/notifications'
import { reportsAccountChanged } from '@/app/actions/action-result'
import { ApiClientError } from '@orbit/shared'
import { getHeldAccountId } from '@/stores/auth-store'
import { getAccountId, useAccountId } from '@/lib/account-scope'
import {
  getExistingPushSubscription,
  isPushSubscriptionOwner,
  recordPushSubscriptionOwner,
  serializePushSubscriptionMutation,
} from '@/lib/push-subscription-owner'
import { getActiveServiceWorkerRegistration } from '@/lib/service-worker-registration'

/** `checking` covers the first render, before the browser reports its push support and subscription. */
export type WebPushPermissionOutcome = 'granted' | 'denied' | 'unsupported'
export type PushPreferenceStatus = WebPushPreferenceStatus | 'checking'

export interface PushPreferenceSnapshot {
  supported: boolean
  subscribed: boolean
  permission: WebPushPermission
  status: PushPreferenceStatus
}

export interface UsePushNotificationPreferencesResult extends PushPreferenceSnapshot {
  loading: boolean
  togglePush: (enabled?: boolean) => Promise<void>
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
  intendedAccountId: string | null = getHeldAccountId(),
): Promise<PushPreferenceSnapshot> {
  if (!isPushNotificationSupported()) {
    return createUnsupportedSnapshot()
  }

  if (!vapidKey) {
    throw new Error('Missing VAPID public key')
  }

  const ownerAccountId = getAccountId()
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

    if (existingSubscription) {
      await existingSubscription.unsubscribe()
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
    })

    await persistPushSubscription(subscription, intendedAccountId, ownerAccountId)

    return createSnapshot(permission, true)
  })
}

async function persistPushSubscription(
  subscription: PushSubscription,
  intendedAccountId: string | null,
  ownerAccountId: string | null,
): Promise<void> {
  try {
    await subscribePushAction(subscription.toJSON(), intendedAccountId)
  } catch (error) {
    await subscription.unsubscribe().catch(() => undefined)
    if (reportsAccountChanged(error)) throw error
    throw new Error('Failed to persist push subscription')
  }
  if (ownerAccountId) recordPushSubscriptionOwner(ownerAccountId)
}

/** Keeps a working endpoint when a reminder is enabled, replacing only an endpoint another account owns. */
export async function ensurePushSubscription(): Promise<PushPreferenceSnapshot> {
  if (!isPushNotificationSupported() || Notification.permission !== 'granted') {
    return subscribeToPushNotifications()
  }
  const intendedAccountId = getHeldAccountId()
  const ownerAccountId = getAccountId()
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  return serializePushSubscriptionMutation(async () => {
    const registration = await getActiveServiceWorkerRegistration()
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      try {
        await subscribePushAction(subscription.toJSON(), intendedAccountId)
        if (ownerAccountId) recordPushSubscriptionOwner(ownerAccountId)
        return createSnapshot('granted', true)
      } catch (error) {
        if (!(error instanceof ApiClientError) || error.code !== 'PUSH_ENDPOINT_OWNED_BY_OTHER_USER') throw error
      }
    }
    if (!vapidKey) throw new Error('Missing VAPID public key')
    await subscription?.unsubscribe()
    const replacement = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
    })
    await persistPushSubscription(replacement, intendedAccountId, ownerAccountId)
    return createSnapshot('granted', true)
  })
}

export async function requestWebPushPermission(): Promise<WebPushPermissionOutcome> {
  if (!isPushNotificationSupported()) return 'unsupported'
  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission()
  return permission === 'granted' ? 'granted' : 'denied'
}

export async function unsubscribeFromPushNotifications(
  permission: WebPushPermission,
): Promise<PushPreferenceSnapshot> {
  if (!isPushNotificationSupported()) {
    return createUnsupportedSnapshot()
  }

  const intendedAccountId = getHeldAccountId()
  return serializePushSubscriptionMutation(async () => {
    const registration = await getActiveServiceWorkerRegistration()
    const subscription = await registration.pushManager.getSubscription()

    if (subscription) {
      try {
        await unsubscribePushAction(subscription.toJSON(), intendedAccountId)
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
 * Logout: removes this browser's subscription on the API while the session cookie still names its
 * account, then in the browser, so the next person here gets none of this account's pushes. Ending it in
 * the browser also ends the endpoint, so the API deletes its row on the next send (410 Gone) even when
 * the first call fails. The Android twin is `unsubscribePushToken` in `apps/mobile/hooks/use-push-notifications.ts`.
 */
export async function releasePushSubscription(): Promise<void> {
  const intendedAccountId = getHeldAccountId()
  return serializePushSubscriptionMutation(async () => {
    const subscription = await getExistingPushSubscription()
    if (!subscription) return
    try {
      await unsubscribePushAction(subscription.toJSON(), intendedAccountId)
    } finally {
      await subscription.unsubscribe()
    }
  })
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

  async function togglePush(enabled = !state.subscribed) {
    setState((current) => ({
      ...current,
      loading: true,
      status: enabled ? 'requesting' : current.status,
    }))

    try {
      const snapshot = enabled
        ? await ensurePushSubscription()
        : await unsubscribeFromPushNotifications(state.permission)

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
