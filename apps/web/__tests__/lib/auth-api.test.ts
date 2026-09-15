import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
}

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeJwt(expirySeconds: number): string {
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value), 'utf8')
      .toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ exp: expirySeconds })}.`
}

const FIXED_NOW = Date.UTC(2026, 3, 22, 12, 0, 0)

describe('auth-api session helpers', () => {
  beforeEach(() => {
    mockCookieStore.get.mockReset()
    mockCookieStore.set.mockReset()
    mockFetch.mockReset()
    vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW)
  })

  it('uses the current access token when it is still valid', async () => {
    const token = makeJwt(Math.floor(FIXED_NOW / 1000) + 3600)
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === 'auth_token') return { value: token }
      return undefined
    })

    const { resolveServerSession } = await import('@/lib/auth-api')
    const session = await resolveServerSession()

    expect(session.token).toBe(token)
    expect(session.refreshed).toBe(false)
    expect(session.refreshFailed).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('refreshes the session when the access token is expired', async () => {
    const expiredToken = makeJwt(Math.floor(FIXED_NOW / 1000) - 60)
    const refreshedToken = makeJwt(Math.floor(FIXED_NOW / 1000) + 7200)

    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === 'auth_token') return { value: expiredToken }
      if (name === 'refresh_token') return { value: 'refresh-token' }
      return undefined
    })
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: refreshedToken, refreshToken: 'refresh-rotated' }),
    })

    const { resolveServerSession } = await import('@/lib/auth-api')
    const session = await resolveServerSession()

    expect(session.token).toBe(refreshedToken)
    expect(session.refreshed).toBe(true)
    expect(session.refreshFailed).toBe(false)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockCookieStore.set).toHaveBeenCalledTimes(2)
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      'auth_token',
      refreshedToken,
      expect.objectContaining({ maxAge: 7200 }),
    )
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      'refresh_token',
      'refresh-rotated',
      expect.objectContaining({ maxAge: 60 * 60 * 24 * 365 }),
    )
  })

  it('refreshes proactively before the current access token expires', async () => {
    const nearlyExpiredToken = makeJwt(Math.floor(FIXED_NOW / 1000) + 30)
    const refreshedToken = makeJwt(Math.floor(FIXED_NOW / 1000) + 7200)
    const persistSession = vi.fn()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: refreshedToken, refreshToken: 'refresh-rotated' }),
    })

    const { resolveSessionTokens } = await import('@/lib/auth-api')
    const session = await resolveSessionTokens({
      authToken: nearlyExpiredToken,
      refreshToken: 'refresh-token',
      persistSession,
    })

    expect(session).toEqual({
      token: refreshedToken,
      expiresAt: FIXED_NOW + 7_200_000,
      refreshed: true,
      refreshFailed: false,
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(persistSession).toHaveBeenCalledWith({
      token: refreshedToken,
      refreshToken: 'refresh-rotated',
    })
  })

  it('sets the auth cookie max-age from the JWT expiry', async () => {
    const token = makeJwt(Math.floor(FIXED_NOW / 1000) + 5400)

    const { setAuthCookie } = await import('@/lib/auth-api')
    await setAuthCookie(token)

    expect(mockCookieStore.set).toHaveBeenCalledWith('auth_token', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: true,
      path: '/',
      maxAge: 5400,
    })
  })

  it('sets the refresh cookie with a one-year lifetime', async () => {
    const { setRefreshCookie } = await import('@/lib/auth-api')
    await setRefreshCookie('refresh-token')

    expect(mockCookieStore.set).toHaveBeenCalledWith('refresh_token', 'refresh-token', {
      httpOnly: true,
      sameSite: 'strict',
      secure: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
  })

  it('clears both session cookies without weakening their attributes', async () => {
    const { clearSessionCookies } = await import('@/lib/auth-api')
    await clearSessionCookies()

    expect(mockCookieStore.set).toHaveBeenNthCalledWith(1, 'auth_token', '', {
      httpOnly: true,
      sameSite: 'strict',
      secure: true,
      path: '/',
      maxAge: 0,
    })
    expect(mockCookieStore.set).toHaveBeenNthCalledWith(2, 'refresh_token', '', {
      httpOnly: true,
      sameSite: 'strict',
      secure: true,
      path: '/',
      maxAge: 0,
    })
  })

  it('keeps the current access token when refresh fails but the token is still valid', async () => {
    const nearlyExpiredToken = makeJwt(Math.floor(FIXED_NOW / 1000) + 30)
    const clearSession = vi.fn()

    const { resolveSessionTokens } = await import('@/lib/auth-api')
    const session = await resolveSessionTokens({
      authToken: nearlyExpiredToken,
      refreshToken: 'refresh-token',
      persistSession: vi.fn(),
      clearSession,
    })

    expect(session).toEqual({
      token: nearlyExpiredToken,
      expiresAt: FIXED_NOW + 30_000,
      refreshed: false,
      refreshFailed: false,
    })
    expect(clearSession).not.toHaveBeenCalled()
  })

  it('keeps an expired session retryable when the refresh request throws', async () => {
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === 'refresh_token') return { value: 'refresh-token' }
      return undefined
    })
    mockFetch.mockRejectedValue(new Error('network unavailable'))

    const { resolveServerSession } = await import('@/lib/auth-api')
    const session = await resolveServerSession()

    expect(session).toEqual({
      token: null,
      expiresAt: null,
      refreshed: false,
      refreshFailed: false,
    })
    expect(mockCookieStore.set).not.toHaveBeenCalled()
  })

  it('keeps an expired session retryable after a non-auth refresh response', async () => {
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === 'refresh_token') return { value: 'refresh-token' }
      return undefined
    })
    mockFetch.mockResolvedValue({ ok: false, status: 503 })

    const { resolveServerSession } = await import('@/lib/auth-api')
    const session = await resolveServerSession()

    expect(session).toEqual({
      token: null,
      expiresAt: null,
      refreshed: false,
      refreshFailed: false,
    })
    expect(mockCookieStore.set).not.toHaveBeenCalled()
  })

  it('clears the session when refresh fails without a usable access token', async () => {
    const clearSession = vi.fn()
    mockFetch.mockResolvedValue({ ok: false, status: 401 })

    const { resolveSessionTokens } = await import('@/lib/auth-api')
    const session = await resolveSessionTokens({
      authToken: null,
      refreshToken: 'refresh-token',
      clearSession,
    })

    expect(session).toEqual({
      token: null,
      expiresAt: null,
      refreshed: false,
      refreshFailed: true,
    })
    expect(clearSession).toHaveBeenCalledTimes(1)
  })

  it('does not reuse a rejected access token when a forced refresh fails', async () => {
    const currentToken = makeJwt(Math.floor(FIXED_NOW / 1000) + 3600)
    const clearSession = vi.fn()
    mockFetch.mockResolvedValue({ ok: false, status: 401 })

    const { resolveSessionTokens } = await import('@/lib/auth-api')
    const session = await resolveSessionTokens({
      authToken: currentToken,
      refreshToken: 'refresh-token',
      forceRefresh: true,
      clearSession,
    })

    expect(session).toEqual({
      token: null,
      expiresAt: null,
      refreshed: false,
      refreshFailed: true,
    })
    expect(clearSession).toHaveBeenCalledTimes(1)
  })

  it('does not clear cookies when refresh fails and clearOnFailure is false', async () => {
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === 'refresh_token') return { value: 'refresh-token' }
      return undefined
    })
    mockFetch.mockResolvedValue({ ok: false, status: 401 })

    const { tryRefreshSession } = await import('@/lib/auth-api')
    const token = await tryRefreshSession({ clearOnFailure: false })

    expect(token).toBeNull()
    expect(mockCookieStore.set).not.toHaveBeenCalled()
  })

  it('deduplicates concurrent refresh requests for the same refresh token', async () => {
    let resolveResponse: (value: unknown) => void = () => {}
    const pendingResponse = new Promise<unknown>((resolve) => {
      resolveResponse = resolve
    })
    mockFetch.mockReturnValue(pendingResponse)

    const { refreshSessionTokens } = await import('@/lib/auth-api')
    const firstRequest = refreshSessionTokens('refresh-token')
    const secondRequest = refreshSessionTokens('refresh-token')

    resolveResponse({
      ok: true,
      json: () => Promise.resolve({
        token: makeJwt(Math.floor(FIXED_NOW / 1000) + 3600),
        refreshToken: 'refresh-rotated',
      }),
    })

    const [first, second] = await Promise.all([firstRequest, secondRequest])

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(first).toEqual(second)
  })
})
