import { useThrottleStore } from '@/stores/throttle-store'
import { sessionAwareFetch } from './api-fetch'

export async function fetchWithThrottle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await sessionAwareFetch(input, init)
  if (response.status === 429) {
    useThrottleStore.getState().show(response.status, await response.clone().json().catch(() => null))
  }
  return response
}
