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
 * Sets the auth_token httpOnly cookie.
 * Aligned with backend JwtSettings.ExpiryHours = 168 (7 days) in appsettings.json.
 * See C:/Users/thoma/.../orbit-api/src/Orbit.Api/appsettings.json JwtSettings.ExpiryHours.
 */
export async function setAuthCookie(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(AUTH_COOKIE, token, {
    ...COOKIE_OPTIONS,
    maxAge: 60 * 60 * 24 * 7, // 7 days (matches backend JWT lifetime)
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
 * Module-scoped single-flight map keyed by the refresh-token value.
 * When two concurrent 401 retries enter `tryRefreshSession` with the same
 * refresh token, the second caller awaits the first caller's in-flight
 * promise instead of issuing a parallel /auth/refresh request.
 *
 * Why keyed by the token value (not by a cookie name): cookies persist
 * across many overlapping route handlers, but the in-flight `Promise` here
 * lives only as long as a single `/auth/refresh` round trip. Tying the key
 * to the token value means a fresh refresh after the previous one resolved
 * starts a brand-new flight (correct), while two overlapping retries that
 * read the same cookie value share one (also correct).
 *
 * The map is cleaned up on settle so memory does not leak across long-lived
 * server processes. Caller AbortSignals do NOT propagate into the inner
 * fetch — aborting one waiter must not break the others. The fetch has its
 * own `AbortSignal.timeout(10000)` to bound the network round trip.
 *
 * Implements PLAN.md Area A #6.
 */
const refreshInflight = new Map<string, Promise<string | null>>()

async function performRefresh(refreshToken: string): Promise<string | null> {
  const apiBase = process.env.API_BASE ?? 'http://localhost:5000'
  try {
    const response = await fetch(`${apiBase}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      // 10s ceiling on the network call itself — independent of any caller
      // signal so one aborted caller never breaks the in-flight refresh.
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

/**
 * Attempts to refresh the session using the refresh_token cookie.
 *
 * Concurrency: this function is single-flight per refresh-token value.
 * If five concurrent 401s call into here with the same token, only ONE
 * `/auth/refresh` request goes out and all five receive the same result.
 * That eliminates the race where the backend rotates the refresh token
 * on every call and two parallel refreshes invalidate each other.
 *
 * On success, updates both cookies and returns the new access token.
 * On failure, clears both cookies and returns null.
 */
export async function tryRefreshSession(): Promise<string | null> {
  const refreshToken = await getRefreshToken()
  if (!refreshToken) {
    await clearSessionCookies()
    return null
  }

  // Re-use any in-flight refresh keyed by the same refresh token value.
  // Caller's own AbortSignal is intentionally not threaded through —
  // aborting waiter #2 must not reject waiter #1.
  const existing = refreshInflight.get(refreshToken)
  if (existing) return existing

  const flight = performRefresh(refreshToken).finally(() => {
    // Drop the entry only if it still references THIS flight. A new
    // refresh issued after this one resolved must not be removed by
    // accident.
    if (refreshInflight.get(refreshToken) === flight) {
      refreshInflight.delete(refreshToken)
    }
  })

  refreshInflight.set(refreshToken, flight)
  return flight
}

/**
 * Test-only helper: clears the in-flight refresh map. Tests should call
 * this in `beforeEach` so a previous test's partial flight does not leak
 * into the next.
 */
export function __resetRefreshInflightForTests(): void {
  refreshInflight.clear()
}
