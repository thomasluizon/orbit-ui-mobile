import { createApiClientError } from '@orbit/shared/utils'
import { useThrottleStore } from '@/stores/throttle-store'
import { sessionAwareFetch } from './api-fetch'

export async function fetchWithThrottle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await sessionAwareFetch(input, init)
  if (response.status === 429) {
    const payload: unknown = await response.clone().json().catch(() => null)
    if (['GET', 'HEAD'].includes((init?.method ?? 'GET').toUpperCase())) {
      throw createApiClientError(response.status, payload, 'Too many requests', response.headers.get('retry-after'))
    }
    useThrottleStore.getState().show(response.status, payload)
  }
  return response
}
