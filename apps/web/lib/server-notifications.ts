import { captureException } from '@sentry/nextjs'
import { API } from '@orbit/shared/api'
import { notificationsResponseSchema } from '@orbit/shared/types/notification'
import { serverRenderFetch } from '@/lib/server-fetch'

export async function loadInitialNotifications(hasSessionCookie: boolean) {
  if (!hasSessionCookie) return null
  try {
    return await serverRenderFetch(
      API.notifications.list,
      { cache: 'no-store', signal: AbortSignal.timeout(10000) },
      notificationsResponseSchema,
    )
  } catch (error) {
    // WHY: A failed preload must leave the notifications query able to retry; https://github.com/thomasluizon/orbit-tickets/issues/1349.
    captureException(error)
    return null
  }
}
