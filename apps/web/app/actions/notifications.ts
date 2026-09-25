'use server'

import { API } from '@orbit/shared/api'
import { serverAuthMutate } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

export async function markNotificationRead(
  notificationId: string, intendedAccountId: string | null
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.notifications.markRead(notificationId), {
    method: 'PUT',
  }, intendedAccountId))
}

export async function markAllNotificationsRead(intendedAccountId: string | null): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.notifications.markAllRead, {
    method: 'PUT',
  }, intendedAccountId))
}

export async function deleteNotification(
  notificationId: string, intendedAccountId: string | null
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.notifications.delete(notificationId), {
    method: 'DELETE',
  }, intendedAccountId))
}

export async function deleteAllNotifications(intendedAccountId: string | null): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.notifications.deleteAll, {
    method: 'DELETE',
  }, intendedAccountId))
}

/**
 * Subscribe to push notifications.
 * The backend expects { endpoint, p256dh, auth } as flat fields.
 * PushSubscriptionJSON has keys nested under subscription.keys.
 */
export async function subscribePush(
  subscription: PushSubscriptionJSON, intendedAccountId: string | null
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
  subscription: PushSubscriptionJSON, intendedAccountId: string | null
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
