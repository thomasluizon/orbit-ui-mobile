'use server'

import { getAuthHeaders } from '@/lib/auth-api'

const API_BASE = process.env.API_BASE ?? 'http://localhost:5000'

async function authFetch(path: string, init: RequestInit) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers, 'Content-Type': 'application/json', ...init.headers },
  })
  if (!res.ok) {
    const error = await res.json().catch(() => null)
    throw new Error(error?.error ?? error?.message ?? `Failed with status ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await authFetch(`/api/notifications/${notificationId}/read`, {
    method: 'PUT',
  })
}

export async function markAllNotificationsRead(): Promise<void> {
  await authFetch('/api/notifications/read-all', {
    method: 'PUT',
  })
}

export async function deleteNotification(notificationId: string): Promise<void> {
  await authFetch(`/api/notifications/${notificationId}`, {
    method: 'DELETE',
  })
}

export async function deleteAllNotifications(): Promise<void> {
  await authFetch('/api/notifications/all', {
    method: 'DELETE',
  })
}

/**
 * Subscribe to push notifications.
 * The backend expects { endpoint, p256dh, auth } as flat fields.
 * PushSubscriptionJSON has keys nested under subscription.keys.
 */
export async function subscribePush(subscription: PushSubscriptionJSON): Promise<void> {
  await authFetch('/api/notifications/subscribe', {
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
  await authFetch('/api/notifications/unsubscribe', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh: subscription.keys?.p256dh ?? '',
      auth: subscription.keys?.auth ?? '',
    }),
  })
}
