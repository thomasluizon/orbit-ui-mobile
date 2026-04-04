import { cookies } from 'next/headers'

const AUTH_COOKIE = 'auth_token'
const REFRESH_COOKIE = 'refresh_token'

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: true,
  path: '/',
}

/**
 * Reads the auth_token httpOnly cookie and returns Bearer headers.
 * For use in Server Actions and Route Handlers.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE)?.value
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

/**
 * Returns the raw auth token string, or null if not present.
 */
export async function getAuthToken(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(AUTH_COOKIE)?.value ?? null
}

/**
 * Returns the raw refresh token string, or null if not present.
 */
export async function getRefreshToken(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(REFRESH_COOKIE)?.value ?? null
}

/**
 * Sets the auth_token httpOnly cookie. Short-lived JWT (1 day).
 */
export async function setAuthCookie(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(AUTH_COOKIE, token, {
    ...COOKIE_OPTIONS,
    maxAge: 60 * 60 * 24, // 1 day
  })
}

/**
 * Sets the refresh_token httpOnly cookie. Long-lived (30 days).
 */
export async function setRefreshCookie(refreshToken: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(REFRESH_COOKIE, refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
}

/**
 * Sets both auth and refresh cookies in one call.
 */
export async function setSessionCookies(token: string, refreshToken: string | null): Promise<void> {
  await setAuthCookie(token)
  if (refreshToken) {
    await setRefreshCookie(refreshToken)
  }
}

/**
 * Clears both auth and refresh cookies.
 */
export async function clearSessionCookies(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(AUTH_COOKIE, '', { ...COOKIE_OPTIONS, maxAge: 0 })
  cookieStore.set(REFRESH_COOKIE, '', { ...COOKIE_OPTIONS, maxAge: 0 })
}

/**
 * Attempts to refresh the session using the refresh_token cookie.
 * On success, updates both cookies and returns the new access token.
 * On failure, clears both cookies and returns null.
 */
export async function tryRefreshSession(): Promise<string | null> {
  const refreshToken = await getRefreshToken()
  if (!refreshToken) {
    await clearSessionCookies()
    return null
  }

  const apiBase = process.env.API_BASE ?? 'http://localhost:5000'

  try {
    const response = await fetch(`${apiBase}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      await clearSessionCookies()
      return null
    }

    const data = (await response.json()) as { token: string; refreshToken: string }
    await setSessionCookies(data.token, data.refreshToken)
    return data.token
  } catch {
    await clearSessionCookies()
    return null
  }
}
