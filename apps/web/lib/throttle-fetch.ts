import { useThrottleStore } from '@/stores/throttle-store'

export async function fetchWithThrottle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init)
  if (response.status === 429) {
    useThrottleStore.getState().show(response.status, await response.clone().json().catch(() => null))
  }
  return response
}
