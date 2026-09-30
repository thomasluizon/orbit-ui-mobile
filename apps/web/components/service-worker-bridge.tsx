'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import * as Sentry from '@sentry/nextjs'
import { getNotificationDestination, invalidateNotificationList } from '@orbit/shared/utils'
import { useUIStore } from '@/stores/ui-store'
import { NOTIFICATION_URL_PARAM, registerServiceWorker } from '@/lib/service-worker-registration'

type AppRouter = ReturnType<typeof useRouter>

function openNotificationUrl(router: AppRouter, url: unknown) {
  const destination = typeof url === 'string' ? getNotificationDestination(url) : null
  if (!destination) return
  router.push(destination.url)
  if (destination.opensAstra) useUIStore.getState().setAstraConversationOpen(true)
}

/** Reads the url `public/sw.js` opened a new window with, then drops it from the address bar. */
function takeLaunchNotificationUrl(): string | null {
  const location = new URL(window.location.href)
  const url = location.searchParams.get(NOTIFICATION_URL_PARAM)
  if (url === null) return null
  location.searchParams.delete(NOTIFICATION_URL_PARAM)
  window.history.replaceState(null, '', `${location.pathname}${location.search}${location.hash}`)
  return url
}

/**
 * Registers the Web Push worker and carries its events into the app: a notification click navigates
 * through the shared destination rule and an arriving push refreshes the notification list, matching
 * the Android handlers in `apps/mobile/hooks/use-push-notifications.ts`. The click receipt on the reply
 * port tells the worker this window took the click, so it does not load the launch link here as well.
 */
export function ServiceWorkerBridge(): null {
  const router = useRouter()
  const queryClient = useQueryClient()

  useEffect(() => {
    const launchUrl = takeLaunchNotificationUrl()
    if (launchUrl !== null) openNotificationUrl(router, launchUrl)
  }, [router])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    void registerServiceWorker().catch((error: unknown) => Sentry.captureException(error))
  }, [])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined

    function handleWorkerMessage(event: MessageEvent<unknown>) {
      const message = event.data
      if (typeof message !== 'object' || message === null || !('type' in message)) return
      if (message.type === 'orbit:push-received') void invalidateNotificationList(queryClient)
      if (message.type === 'orbit:notification-click' && 'url' in message) {
        event.ports[0]?.postMessage({ type: 'orbit:notification-click-received' })
        openNotificationUrl(router, message.url)
      }
    }

    const container = navigator.serviceWorker
    container.addEventListener('message', handleWorkerMessage)
    return () => container.removeEventListener('message', handleWorkerMessage)
  }, [queryClient, router])

  return null
}
