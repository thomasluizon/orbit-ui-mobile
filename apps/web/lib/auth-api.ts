import { cookies } from 'next/headers'
import { API } from '@orbit/shared/api'

export const AUTH_COOKIE = 'auth_token'
export const REFRESH_COOKIE = 'refresh_token'

const ACCESS_TOKEN_REFRESH_THRESHOLD_MS = 60_000
const DEFAULT_ACCESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: true,
  path: '/',
}

export type SessionTokens = {
  token: string
  refreshToken: string
}

type CookieValueReader = {
  get: (name: string) => { value?: string } | undefined
}

type CookieValueWriter = {
  set: (
    name: string,
    value: string,
    options: typeof COOKIE_OPTIONS & { maxAge: number },
  ) => unknown
}

type CookieTarget = CookieValueReader & CookieValueWriter

type ResolvedServerSession = {
  token: string | null
  expiresAt: number | null
  refreshed: boolean
  refreshFailed: boolean
}

type RefreshSessionResult =
  | { outcome: 'refreshed'; tokens: SessionTokens }
  | { outcome: 'rejected' }
  | { outcome: 'retryable' }

const refreshRequests = new Map<string, Promise<RefreshSessionResult>>()

function getCookieValue(source: CookieValueReader, name: string): string | null {
  return source.get(name)?.value ?? null
}

function decodeBase64Url(segment: string): string {
  const normalized = segment.replaceAll('-', '+').replaceAll('_', '/')
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '=',
  )

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(padded, 'base64').toString('utf-8')
  }

  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0)
  return new TextDecoder().decode(bytes)
}

function getTokenExpiry(token: string): number | null {
  try {
    const payloadSegment = token.split('.')[1]
    if (!payloadSegment) return null
    const payload = JSON.parse(decodeBase64Url(payloadSegment)) as { exp?: number }
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

function getAccessCookieMaxAge(token: string): number {
  const expiresAt = getTokenExpiry(token)
  if (!expiresAt) return DEFAULT_ACCESS_COOKIE_MAX_AGE

  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
}

async function getCookieStore(): Promise<CookieTarget> {
  return await cookies()
}

/**
 * Returns the raw refresh token string, or null if not present.
 */
export async function getRefreshToken(): Promise<string | null> {
  const cookieStore = await getCookieStore()
  return getCookieValue(cookieStore, REFRESH_COOKIE)
}

/**
 * Sets the auth_token httpOnly cookie. The cookie lifetime matches the JWT exp.
 */
export async function setAuthCookie(
  token: string,
  cookieTarget?: CookieValueWriter,
): Promise<void> {
  const target = cookieTarget ?? await getCookieStore()
  await target.set(AUTH_COOKIE, token, {
    ...COOKIE_OPTIONS,
    maxAge: getAccessCookieMaxAge(token),
  })
}

/**
 * Sets the refresh_token httpOnly cookie. Long-lived to preserve sign-in.
 */
export async function setRefreshCookie(
  refreshToken: string,
  cookieTarget?: CookieValueWriter,
): Promise<void> {
  const target = cookieTarget ?? await getCookieStore()
  await target.set(REFRESH_COOKIE, refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: REFRESH_COOKIE_MAX_AGE,
  })
}

export async function clearRefreshCookie(
  cookieTarget?: CookieValueWriter,
): Promise<void> {
  const target = cookieTarget ?? await getCookieStore()
  await target.set(REFRESH_COOKIE, '', { ...COOKIE_OPTIONS, maxAge: 0 })
}

/**
 * Sets both auth and refresh cookies in one call.
 */
export async function setSessionCookies(
  token: string,
  refreshToken: string | null,
  cookieTarget?: CookieValueWriter,
): Promise<void> {
  const target = cookieTarget ?? await getCookieStore()
  await setAuthCookie(token, target)
  if (refreshToken) {
    await setRefreshCookie(refreshToken, target)
  }
}

/**
 * Clears both auth and refresh cookies.
 */
export async function clearSessionCookies(
  cookieTarget?: CookieValueWriter,
): Promise<void> {
  const target = cookieTarget ?? await getCookieStore()
  await target.set(AUTH_COOKIE, '', { ...COOKIE_OPTIONS, maxAge: 0 })
  await clearRefreshCookie(target)
}

export async function refreshSessionTokens(
  refreshToken: string,
): Promise<RefreshSessionResult> {
  const inFlight = refreshRequests.get(refreshToken)
  if (inFlight) {
    return inFlight
  }

  const apiBase = process.env.API_BASE ?? 'http://localhost:5000'

  const request = (async (): Promise<RefreshSessionResult> => {
    try {
      const response = await fetch(`${apiBase}${API.auth.refresh}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) {
        return { outcome: response.status === 401 ? 'rejected' : 'retryable' }
      }

      return {
        outcome: 'refreshed',
        tokens: (await response.json()) as SessionTokens,
      }
    } catch {
      return { outcome: 'retryable' }
    }
  })()

  refreshRequests.set(refreshToken, request)

  try {
    return await request
  } finally {
    if (refreshRequests.get(refreshToken) === request) {
      refreshRequests.delete(refreshToken)
    }
  }
}

/**
 * Attempts to refresh the session using the refresh_token cookie.
 * On success, updates both cookies and returns the new access token.
 * On failure, optionally clears both cookies and returns null.
 */
export async function tryRefreshSession(options?: {
  clearOnFailure?: boolean
  cookieTarget?: CookieValueWriter
}): Promise<string | null> {
  const clearOnFailure = options?.clearOnFailure ?? true
  const refreshToken = await getRefreshToken()
  if (!refreshToken) {
    if (clearOnFailure) {
      await clearSessionCookies(options?.cookieTarget)
    }
    return null
  }

  const refreshResult = await refreshSessionTokens(refreshToken)
  if (refreshResult.outcome !== 'refreshed') {
    if (clearOnFailure && refreshResult.outcome === 'rejected') {
      await clearSessionCookies(options?.cookieTarget)
    }
    return null
  }

  const { tokens } = refreshResult
  await setSessionCookies(tokens.token, tokens.refreshToken, options?.cookieTarget)
  return tokens.token
}

export async function resolveServerSession(options?: {
  forceRefresh?: boolean
  refreshThresholdMs?: number
}): Promise<ResolvedServerSession> {
  const cookieStore = await getCookieStore()
  const authToken = getCookieValue(cookieStore, AUTH_COOKIE)
  const refreshToken = getCookieValue(cookieStore, REFRESH_COOKIE)

  return resolveSessionTokens({
    authToken,
    refreshToken,
    forceRefresh: options?.forceRefresh ?? false,
    refreshThresholdMs: options?.refreshThresholdMs ?? ACCESS_TOKEN_REFRESH_THRESHOLD_MS,
    persistSession: async (tokens) => {
      await setSessionCookies(tokens.token, tokens.refreshToken, cookieStore)
    },
    clearSession: async () => {
      await clearSessionCookies(cookieStore)
    },
  })
}

export async function resolveSessionTokens(options: {
  authToken: string | null
  refreshToken: string | null
  forceRefresh?: boolean
  refreshThresholdMs?: number
  persistSession?: (tokens: SessionTokens) => void | Promise<void>
  clearSession?: () => void | Promise<void>
}): Promise<ResolvedServerSession> {
  const forceRefresh = options.forceRefresh ?? false
  const refreshThresholdMs =
    options.refreshThresholdMs ?? ACCESS_TOKEN_REFRESH_THRESHOLD_MS
  const currentExpiry = options.authToken
    ? getTokenExpiry(options.authToken)
    : null

  if (
    options.authToken &&
    currentExpiry &&
    !forceRefresh &&
    currentExpiry - Date.now() > refreshThresholdMs
  ) {
    return {
      token: options.authToken,
      expiresAt: currentExpiry,
      refreshed: false,
      refreshFailed: false,
    }
  }

  if (options.refreshToken) {
    const refreshResult = await refreshSessionTokens(options.refreshToken)
    if (refreshResult.outcome === 'refreshed') {
      const { tokens: refreshedTokens } = refreshResult
      await options.persistSession?.(refreshedTokens)
      return {
        token: refreshedTokens.token,
        expiresAt: getTokenExpiry(refreshedTokens.token),
        refreshed: true,
        refreshFailed: false,
      }
    }

    if (!forceRefresh && options.authToken && currentExpiry && currentExpiry > Date.now()) {
      return {
        token: options.authToken,
        expiresAt: currentExpiry,
        refreshed: false,
        refreshFailed: false,
      }
    }

    if (refreshResult.outcome === 'rejected') {
      await options.clearSession?.()
    }
    return {
      token: null,
      expiresAt: null,
      refreshed: false,
      refreshFailed: refreshResult.outcome === 'rejected',
    }
  }

  if (!forceRefresh && options.authToken && currentExpiry && currentExpiry > Date.now()) {
    return {
      token: options.authToken,
      expiresAt: currentExpiry,
      refreshed: false,
      refreshFailed: false,
    }
  }

  if (forceRefresh) {
    await options.clearSession?.()
  }

  return {
    token: null,
    expiresAt: null,
    refreshed: false,
    refreshFailed: false,
  }
}
