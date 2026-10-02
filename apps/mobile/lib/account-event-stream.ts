import { fetch as expoFetch } from 'expo/fetch'
import { API } from '@orbit/shared/api'
import { getToken } from './secure-store'

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://api.useorbit.org'

export async function openAccountEventStream(
  signal: AbortSignal,
  lastEventId: string | null,
): Promise<Awaited<ReturnType<typeof expoFetch>>> {
  async function open(token: string | null) {
    return expoFetch(`${API_BASE}${API.events.stream}`, {
      signal,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
      },
    })
  }

  const response = await open(await getToken())
  if (response.status !== 401) return response
  const { refreshSessionToken } = await import('@/stores/auth-store')
  const refreshedToken = await refreshSessionToken()
  if (!refreshedToken) return response
  return open(refreshedToken)
}
