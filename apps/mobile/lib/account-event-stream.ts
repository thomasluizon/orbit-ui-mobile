import { fetch as expoFetch } from 'expo/fetch'
import { API } from '@orbit/shared/api'
import { getToken } from './secure-store'

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://api.useorbit.org'

export async function openAccountEventStream(
  signal: AbortSignal,
  lastEventId: string | null,
): Promise<Awaited<ReturnType<typeof expoFetch>> | { sessionRejected: true }> {
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
  const { refreshSession } = await import('@/stores/auth-store')
  const outcome = await refreshSession()
  if (outcome.status === 'unauthorized') return { sessionRejected: true }
  if (outcome.status !== 'refreshed') return response
  return open(outcome.token)
}
