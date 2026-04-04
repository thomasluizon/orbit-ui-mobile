import { getToken, clearAllTokens } from './secure-store'

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://api.useorbit.org'

export async function apiClient<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getToken()
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })

  if (res.status === 401) {
    await clearAllTokens()
    // Navigation to login handled by auth store listener
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const error = await res.json().catch(() => null)
    throw new Error(
      error?.error ?? error?.message ?? `Request failed: ${res.status}`,
    )
  }

  if (res.status === 204) return undefined as T
  return res.json()
}
