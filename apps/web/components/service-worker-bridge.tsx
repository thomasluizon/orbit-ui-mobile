'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import * as Sentry from '@sentry/nextjs'
import { getNotificationDestination, invalidateNotificationList } from '@orbit/shared/utils'
import { habitKeys, proactiveKeys } from '@orbit/shared/query'
import { NOTIFICATION_URL_PARAM, registerServiceWorker } from '@/lib/service-worker-registration'
import { isDesktopPush } from '@/lib/desktop-runtime'
import { useAccountId } from '@/lib/account-scope'

type AppRouter = ReturnType<typeof useRouter>

function openNotificationUrl(router: AppRouter, url: unknown) {
  const destination = typeof url === 'string' ? getNotificationDestination(url) : null
  if (!destination) return
  router.push(destination.opensAstra ? '/?astra=proactive' : destination.url)
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
  const accountId = useAccountId()

  useEffect(() => {
    if (!isDesktopPush()) return
    let cancelled = false
    const resume = () => {
      void import('@/lib/desktop-push').then((module) => {
        if (!cancelled) return module.resumeDesktopPush(accountId)
      }).catch((error: unknown) => Sentry.captureException(error))
    }
    resume()
    const interval = setInterval(resume, 60 * 60 * 1000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [accountId])

  useEffect(() => {
    if (!isDesktopPush()) return
    function receive() {
      void invalidateNotificationList(queryClient)
      void queryClient.invalidateQueries({ queryKey: proactiveKeys.current() })
    }
    window.addEventListener('orbit-desktop-push', receive)
    return () => window.removeEventListener('orbit-desktop-push', receive)
  }, [queryClient])

  useEffect(() => {
    const launchUrl = takeLaunchNotificationUrl()
    if (launchUrl !== null) openNotificationUrl(router, launchUrl)
  }, [router])

  useEffect(() => {
    if (isDesktopPush() || !('serviceWorker' in navigator)) return
    void registerServiceWorker().catch((error: unknown) => Sentry.captureException(error))
  }, [])

  useEffect(() => {
    if (isDesktopPush() || !('serviceWorker' in navigator)) return undefined

    function handleWorkerMessage(event: MessageEvent<unknown>) {
      const message = event.data
      if (typeof message !== 'object' || message === null || !('type' in message)) return
      if (message.type === 'orbit:push-received' || message.type === 'orbit:reminder-done') {
        if (message.type === 'orbit:reminder-done') void queryClient.invalidateQueries({ queryKey: habitKeys.all })
        void invalidateNotificationList(queryClient)
        void queryClient.invalidateQueries({ queryKey: proactiveKeys.current() })
      }
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
