'use server'

import { API } from '@orbit/shared/api'
import { serverAuthFetch } from '@/lib/server-fetch'

export async function markNotificationRead(notificationId: string): Promise<void> {
  await serverAuthFetch(API.notifications.markRead(notificationId), {
    method: 'PUT',
  })
}

export async function markAllNotificationsRead(): Promise<void> {
  await serverAuthFetch(API.notifications.markAllRead, {
    method: 'PUT',
  })
}

export async function deleteNotification(notificationId: string): Promise<void> {
  await serverAuthFetch(API.notifications.delete(notificationId), {
    method: 'DELETE',
  })
}

export async function deleteAllNotifications(): Promise<void> {
  await serverAuthFetch(API.notifications.deleteAll, {
    method: 'DELETE',
  })
}

/**
 * Subscribe to push notifications.
 * The backend expects { endpoint, p256dh, auth } as flat fields.
 * PushSubscriptionJSON has keys nested under subscription.keys.
 */
export async function subscribePush(subscription: PushSubscriptionJSON): Promise<void> {
  await serverAuthFetch(API.notifications.subscribe, {
    method: 'POST',
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh: subscription.keys?.p256dh ?? '',
      auth: subscription.keys?.auth ?? '',
    }),
  })
}

/**
 * Unsubscribe from push notifications.
 * The backend expects { endpoint, p256dh, auth } as flat fields.
 */
export async function unsubscribePush(subscription: PushSubscriptionJSON): Promise<void> {
  await serverAuthFetch(API.notifications.unsubscribe, {
    method: 'POST',
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh: subscription.keys?.p256dh ?? '',
      auth: subscription.keys?.auth ?? '',
    }),
  })
}
