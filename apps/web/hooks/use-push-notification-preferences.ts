import { useEffect, useState } from 'react'
import {
  getPushStatusToneClass,
  getWebPushStatusMessageKey,
  getWebPushStatusTone,
  type WebPushPermission,
  type WebPushPreferenceStatus,
} from '@orbit/shared/utils'

export type PushPreferenceStatus = WebPushPreferenceStatus

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

export function getPushStatusTone(status: PushPreferenceStatus): string {
  return getPushStatusToneClass(getWebPushStatusTone(status))
}

export function getPushStatusMessageKey(
  status: PushPreferenceStatus,
  permission: WebPushPermission,
): string {
  return getWebPushStatusMessageKey(status, permission)
}

export async function loadPushNotificationState(): Promise<PushPreferenceSnapshot> {
  if (!isPushNotificationSupported()) {
    return createUnsupportedSnapshot()
  }

  const permission = Notification.permission

  if (permission === 'denied') {
    return createSnapshot(permission, false)
  }

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()

    return createSnapshot(permission, Boolean(subscription))
  } catch {
    return createSyncFailedSnapshot(permission)
  }
}

export async function subscribeToPushNotifications(
  vapidKey: string | undefined = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
): Promise<PushPreferenceSnapshot> {
  if (!isPushNotificationSupported()) {
    return createUnsupportedSnapshot()
  }

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission()

  if (permission !== 'granted') {
    return createSnapshot(permission, false)
  }

  const registration = await navigator.serviceWorker.ready
  const existingSubscription = await registration.pushManager.getSubscription()

  if (existingSubscription) {
    await existingSubscription.unsubscribe()
  }

  if (!vapidKey) {
    throw new Error('Missing VAPID public key')
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
  })

  const keys = subscription.toJSON()
  const response = await fetch('/api/notifications/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh: keys.keys?.p256dh,
      auth: keys.keys?.auth,
    }),
  })

  if (!response.ok) {
    await subscription.unsubscribe().catch(() => undefined)
    throw new Error(`Failed to subscribe: ${response.status}`)
  }

  return createSnapshot(permission, true)
}

export async function unsubscribeFromPushNotifications(
  permission: WebPushPermission,
): Promise<PushPreferenceSnapshot> {
  if (!isPushNotificationSupported()) {
    return createUnsupportedSnapshot()
  }

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()

  if (subscription) {
    const keys = subscription.toJSON()

    await fetch('/api/notifications/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        p256dh: keys.keys?.p256dh,
        auth: keys.keys?.auth,
      }),
    })

    await subscription.unsubscribe()
  }

  const nextPermission = permission || Notification.permission
  return createSnapshot(nextPermission, false)
}

export function usePushNotificationPreferences(): UsePushNotificationPreferencesResult {
  const [state, setState] = useState<UsePushNotificationPreferencesResult>({
    ...createUnsupportedSnapshot(),
    loading: false,
    togglePush: async () => undefined,
  })

  useEffect(() => {
    let cancelled = false

    void loadPushNotificationState().then((snapshot) => {
      if (cancelled) {
        return
      }

      setState((current) => ({
        ...current,
        ...snapshot,
      }))
    })

    return () => {
      cancelled = true
    }
  }, [])

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
    } catch {
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
