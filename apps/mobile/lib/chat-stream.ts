import { fetch as expoFetch } from 'expo/fetch'
import { buildClientTimeZoneHeaders } from '@orbit/shared'
import { API } from '@orbit/shared/api'
import { getToken } from './secure-store'

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://api.useorbit.org'

type FetchResponse = Awaited<ReturnType<typeof expoFetch>>

async function executeStreamRequest(
  formData: FormData,
  signal: AbortSignal,
  token: string | null,
): Promise<FetchResponse> {
  const headers: Record<string, string> = { ...buildClientTimeZoneHeaders() }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return expoFetch(`${API_BASE}${API.chat.stream}`, {
    method: 'POST',
    headers,
    body: formData,
    signal,
  })
}

/**
 * Opens the chat SSE stream via expo/fetch — React Native's built-in fetch
 * cannot expose a readable response body. Mirrors apiClient's auth handling:
 * SecureStore bearer token plus a single refresh-token rotation on 401.
 */
export async function openChatStream(
  formData: FormData,
  signal: AbortSignal,
): Promise<FetchResponse> {
  const token = await getToken()
  const response = await executeStreamRequest(formData, signal, token)

  if (response.status !== 401) return response

  const { refreshSessionToken } = await import('@/stores/auth-store')
  const refreshedToken = await refreshSessionToken({ clearOnFailure: false })
  if (!refreshedToken) return response

  return executeStreamRequest(formData, signal, refreshedToken)
}
