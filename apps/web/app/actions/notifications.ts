'use server'

import { API } from '@orbit/shared/api'
import { serverAuthMutate } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

/**
 * Every notification write carries the account the person was looking at when they acted, so the
 * server can refuse it once the shared cookie has moved on. The four of them run the same two
 * lines, so they share one, and the account argument cannot then be added to three of them and
 * forgotten on the fourth.
 */
function writeNotificationsForAccount(
  path: string,
  method: 'PUT' | 'DELETE',
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(path, { method }, intendedAccountId))
}

export async function markNotificationRead(
  notificationId: string,
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return writeNotificationsForAccount(
    API.notifications.markRead(notificationId),
    'PUT',
    intendedAccountId,
  )
}

export async function markAllNotificationsRead(
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return writeNotificationsForAccount(API.notifications.markAllRead, 'PUT', intendedAccountId)
}

export async function deleteNotification(
  notificationId: string,
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return writeNotificationsForAccount(
    API.notifications.delete(notificationId),
    'DELETE',
    intendedAccountId,
  )
}

export async function deleteAllNotifications(
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return writeNotificationsForAccount(API.notifications.deleteAll, 'DELETE', intendedAccountId)
}

/**
 * Subscribe to push notifications.
 * The backend expects { endpoint, p256dh, auth } as flat fields.
 * PushSubscriptionJSON has keys nested under subscription.keys.
 */
export async function subscribePush(
  subscription: PushSubscriptionJSON,
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.notifications.subscribe, {
    method: 'POST',
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh: subscription.keys?.p256dh ?? '',
      auth: subscription.keys?.auth ?? '',
    }),
  }, intendedAccountId))
}

/**
 * Unsubscribe from push notifications.
 * The backend expects { endpoint, p256dh, auth } as flat fields.
 */
export async function unsubscribePush(
  subscription: PushSubscriptionJSON,
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.notifications.unsubscribe, {
    method: 'POST',
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh: subscription.keys?.p256dh ?? '',
      auth: subscription.keys?.auth ?? '',
    }),
  }, intendedAccountId))
}
