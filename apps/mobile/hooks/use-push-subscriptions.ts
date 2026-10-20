import { useQuery } from '@tanstack/react-query'
import * as Crypto from 'expo-crypto'
import { API } from '@orbit/shared/api'
import { pushSubscriptionsResponseSchema, type PushSubscriptionsResponse } from '@orbit/shared/types/push-subscription'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth-store'

async function loadPushSubscriptions(pushToken: string | null) {
  const response = await apiClient<PushSubscriptionsResponse>(
    API.notifications.subscriptions,
    undefined,
    pushSubscriptionsResponseSchema,
  )
  const endpointHash = pushToken
    ? await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pushToken)
    : null
  return { response, endpointHash }
}

export async function hasPushSubscriptionCapacity(pushToken: string | null): Promise<boolean> {
  const { response, endpointHash } = await loadPushSubscriptions(pushToken)
  return response.items.length < response.max || Boolean(endpointHash && response.items.some(
    (item) => item.transport === 'native' && item.endpointHash === endpointHash,
  ))
}

export function usePushSubscriptions(pushToken: string | null) {
  const userId = useAuthStore((state) => state.user?.userId ?? null)
  const query = useQuery({
    queryKey: ['pushSubscriptions', userId, pushToken],
    enabled: userId !== null,
    queryFn: () => loadPushSubscriptions(pushToken),
  })
  const response = query.data?.response
  const endpointHash = query.data?.endpointHash
  return {
    count: response?.items.length,
    max: response?.max,
    isCurrentDeviceRegistered: Boolean(endpointHash && response?.items.some(
      (item) => item.transport === 'native' && item.endpointHash === endpointHash,
    )),
    isLoading: query.isLoading,
    isError: query.isError,
    refresh: query.refetch,
  }
}
