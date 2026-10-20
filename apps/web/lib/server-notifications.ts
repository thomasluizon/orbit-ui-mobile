import { captureException } from '@sentry/nextjs'
import { API } from '@orbit/shared/api'
import { notificationsResponseSchema } from '@orbit/shared/types/notification'
import { serverRenderFetch } from '@/lib/server-fetch'
import type { PreloadedNotifications } from '@/lib/notifications-preload'

export async function loadInitialNotifications(hasSessionCookie: boolean): Promise<PreloadedNotifications | null> {
  if (!hasSessionCookie) return null
  try {
    const notifications = await serverRenderFetch(
      API.notifications.list,
      { cache: 'no-store', signal: AbortSignal.timeout(10000) },
      notificationsResponseSchema,
    )
    return notifications === null ? null : { notifications, updatedAt: Date.now() }
  } catch (error) {
    // WHY: A failed preload must leave the notifications query able to retry; https://github.com/thomasluizon/orbit-tickets/issues/1349.
    captureException(error)
    return null
  }
}
