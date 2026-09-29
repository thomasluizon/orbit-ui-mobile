'use client'

import { useQuery } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { pushSubscriptionsResponseSchema } from '@orbit/shared/types/push-subscription'
import { bytesToHex } from '@orbit/shared/utils'
import { fetchJson } from '@/lib/api-fetch'
import { useAccountGeneration } from '@/hooks/use-session-reset'
import { isPushNotificationSupported } from './use-push-notification-preferences'

async function currentEndpointHash(): Promise<string | null> {
  if (!isPushNotificationSupported()) return null
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(subscription.endpoint))
  return bytesToHex(new Uint8Array(digest))
}

export function usePushSubscriptions() {
  const accountGeneration = useAccountGeneration()
  const query = useQuery({
    queryKey: ['pushSubscriptions', accountGeneration],
    queryFn: async () => {
      const response = await fetchJson(API.notifications.subscriptions, pushSubscriptionsResponseSchema)
      const endpointHash = await currentEndpointHash()
      return { response, endpointHash }
    },
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })
  const response = query.data?.response
  const endpointHash = query.data?.endpointHash
  return {
    count: response?.items.length,
    max: response?.max,
    isCurrentDeviceRegistered: Boolean(endpointHash && response?.items.some(
      (item) => item.transport === 'web' && item.endpointHash === endpointHash,
    )),
    isLoading: query.isLoading,
    isError: query.isError,
    refresh: query.refetch,
  }
}
