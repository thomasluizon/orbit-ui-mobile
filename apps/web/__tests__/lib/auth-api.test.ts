import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccountIdFromToken } from '@/lib/auth-api'

const { mockCookies, mockCookieStore } = vi.hoisted(() => {
  const cookieStore = {
    get: vi.fn(),
    set: vi.fn(),
  }
  return {
    mockCookies: vi.fn(() => Promise.resolve(cookieStore)),
    mockCookieStore: cookieStore,
  }
})

vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: mockCookies,
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function encodeJwtSegment(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function makeJwt(expirySeconds: number): string {
  return `${encodeJwtSegment({ alg: 'none', typ: 'JWT' })}.${encodeJwtSegment({ exp: expirySeconds })}.`
}

const ACCOUNT_CLAIM = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'

function makeIssuedJwt(userId: string): string {
  const issuedAtSeconds = Math.floor(FIXED_NOW / 1000)
  return [
    encodeJwtSegment({ alg: 'HS256', typ: 'JWT' }),
    encodeJwtSegment({
      aud: 'orbit-client',
      iss: 'orbit-api',
      exp: issuedAtSeconds + 3600,
      [ACCOUNT_CLAIM]: userId,
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress': 'ada@example.com',
      jti: '8c7d6e5f-4a3b-2c1d-0e9f-8a7b6c5d4e3f',
      iat: issuedAtSeconds,
      nbf: issuedAtSeconds,
    }),
    'ZmFrZS1zaWduYXR1cmU',
  ].join('.')
}

const FIXED_NOW = Date.UTC(2026, 3, 22, 12, 0, 0)

describe('auth-api session helpers', () => {
  beforeEach(() => {
    mockCookies.mockReset()
    mockCookies.mockResolvedValue(mockCookieStore)
    mockCookieStore.get.mockReset()
    mockCookieStore.set.mockReset()
    mockFetch.mockReset()
    vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW)
  })

  it('reads the account from the hermetic session token used by layout fixtures', async () => {
    const { mintHermeticJwt } = await import('@/test-support/hermetic/hermetic-session')

    expect(getAccountIdFromToken(mintHermeticJwt())).toBe('hermetic-perf-user')
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

  it('ends a nearly expired session after a definitive refresh rejection', async () => {
    const token = makeJwt(Math.floor(FIXED_NOW / 1000) + 30)
    mockFetch.mockResolvedValue(new Response(null, { status: 401 }))
    const { resolveSessionTokens } = await import('@/lib/auth-api')
    const clearSession = vi.fn()
    const session = await resolveSessionTokens({ authToken: token, refreshToken: 'rejected-refresh', clearSession })
    expect(session).toEqual({ token: null, expiresAt: null, refreshed: false, refreshFailed: true })
    expect(clearSession).not.toHaveBeenCalled()
  })

  it('reports rejection without writing deletion cookies', async () => {
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
    expect(clearSession).not.toHaveBeenCalled()
  })

  it('does not let a late stale BFF response clear cookies from a winning rotation', async () => {
    const expiredToken = makeJwt(Math.floor(FIXED_NOW / 1000) - 60)
    const refreshedToken = makeJwt(Math.floor(FIXED_NOW / 1000) + 3600)
    const createRequestCookieStore = () => ({
      get: vi.fn((name: string) => {
        if (name === 'auth_token') return { value: expiredToken }
        if (name === 'refresh_token') return { value: 'shared-old-refresh-token' }
        return undefined
      }),
      set: vi.fn(),
    })
    const losingCookieStore = createRequestCookieStore()
    const winningCookieStore = createRequestCookieStore()
    mockCookies
      .mockResolvedValueOnce(losingCookieStore)
      .mockResolvedValueOnce(winningCookieStore)

    let releaseLosingRefresh = () => {}
    const losingRefreshGate = new Promise<void>((resolve) => {
      releaseLosingRefresh = resolve
    })
    mockFetch
      .mockImplementationOnce(async () => {
        await losingRefreshGate
        return { ok: false, status: 401 }
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          token: refreshedToken,
          refreshToken: 'winning-refresh-token',
        }),
      })

    vi.resetModules()
    const { GET: getLosingSession } = await import('@/app/api/auth/session/route')
    const losingResponsePromise = getLosingSession()
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

    vi.resetModules()
    const { GET: getWinningSession } = await import('@/app/api/auth/session/route')
    const winningResponse = await getWinningSession()
    releaseLosingRefresh()
    const lateLosingResponse = await losingResponsePromise

    expect(winningResponse.status).toBe(200)
    expect(lateLosingResponse.status).toBe(401)
    expect(await lateLosingResponse.json()).toEqual({
      expiresAt: null,
      userId: null,
      refreshFailed: true,
    })
    expect(winningCookieStore.set).toHaveBeenCalledTimes(2)
    expect(losingCookieStore.set).not.toHaveBeenCalled()
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
    expect(clearSession).not.toHaveBeenCalled()
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

  it('persists rotated tokens when tryRefreshSession succeeds', async () => {
    const refreshedToken = makeJwt(Math.floor(FIXED_NOW / 1000) + 3600)
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === 'refresh_token') return { value: 'refresh-token' }
      return undefined
    })
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        token: refreshedToken,
        refreshToken: 'refresh-rotated',
      }),
    })

    const { tryRefreshSession } = await import('@/lib/auth-api')
    const token = await tryRefreshSession()

    expect(token).toBe(refreshedToken)
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      'auth_token',
      refreshedToken,
      expect.objectContaining({ maxAge: 3600 }),
    )
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      'refresh_token',
      'refresh-rotated',
      expect.objectContaining({ maxAge: 60 * 60 * 24 * 365 }),
    )
  })

  it('clears cookies when tryRefreshSession receives a confirmed rejection', async () => {
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === 'refresh_token') return { value: 'refresh-token' }
      return undefined
    })
    mockFetch.mockResolvedValue({ ok: false, status: 401 })

    const { tryRefreshSession } = await import('@/lib/auth-api')
    const token = await tryRefreshSession()

    expect(token).toBeNull()
    expect(mockCookieStore.set).toHaveBeenCalledTimes(2)
  })

  it('keeps cookies when tryRefreshSession receives a retryable failure', async () => {
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === 'refresh_token') return { value: 'refresh-token' }
      return undefined
    })
    mockFetch.mockResolvedValue({ ok: false, status: 503 })

    const { tryRefreshSession } = await import('@/lib/auth-api')
    const token = await tryRefreshSession()

    expect(token).toBeNull()
    expect(mockCookieStore.set).not.toHaveBeenCalled()
  })

  it('clears cookies when tryRefreshSession has no refresh token', async () => {
    const { tryRefreshSession } = await import('@/lib/auth-api')
    const token = await tryRefreshSession()

    expect(token).toBeNull()
    expect(mockCookieStore.set).toHaveBeenCalledTimes(2)
  })

  it('keeps a nearly expired access token when no refresh token exists', async () => {
    const nearlyExpiredToken = makeJwt(Math.floor(FIXED_NOW / 1000) + 30)

    const { resolveSessionTokens } = await import('@/lib/auth-api')
    const session = await resolveSessionTokens({
      authToken: nearlyExpiredToken,
      refreshToken: null,
    })

    expect(session).toEqual({
      token: nearlyExpiredToken,
      expiresAt: FIXED_NOW + 30_000,
      refreshed: false,
      refreshFailed: false,
    })
  })

  it('clears cookies when a forced refresh has no refresh token', async () => {
    const { resolveServerSession } = await import('@/lib/auth-api')
    const session = await resolveServerSession({ forceRefresh: true })

    expect(session).toEqual({
      token: null,
      expiresAt: null,
      refreshed: false,
      refreshFailed: false,
    })
    expect(mockCookieStore.set).toHaveBeenCalledTimes(2)
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

  it('decodes the account id out of a token shaped like the one the API issues', async () => {
    const { getAccountIdFromToken } = await import('@/lib/auth-api')
    const userId = '3f1d2c4b-8a67-4b2e-9d0f-5c6a7b8e9f01'

    expect(getAccountIdFromToken(makeIssuedJwt(userId))).toBe(userId)
  })

  it('reports no account when the token carries only the claim names the API never emits', async () => {
    const { getAccountIdFromToken } = await import('@/lib/auth-api')
    const token = [
      encodeJwtSegment({ alg: 'HS256', typ: 'JWT' }),
      encodeJwtSegment({ sub: 'user-1', nameid: 'user-1' }),
      'ZmFrZS1zaWduYXR1cmU',
    ].join('.')

    expect(getAccountIdFromToken(token)).toBeNull()
  })

  it('reports no account for a token with no readable payload', async () => {
    const { getAccountIdFromToken } = await import('@/lib/auth-api')

    expect(getAccountIdFromToken('not-a-token')).toBeNull()
    expect(getAccountIdFromToken(`${encodeJwtSegment({ alg: 'HS256' })}.%%%.signature`)).toBeNull()
  })
  it('ends stalled refreshes at sixty seconds without clearing cookies and allows a new request', async () => {
    const tokens = {
      token: makeJwt(Math.floor(FIXED_NOW / 1000) + 3600),
      refreshToken: 'refresh-rotated',
    }
    mockCookieStore.get.mockImplementation((name: string) =>
      name === 'refresh_token' ? { value: 'stalled-refresh-token' } : undefined)
    mockFetch
      .mockImplementationOnce((_url: string, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }))
      .mockResolvedValueOnce(Response.json(tokens))
    const { refreshSessionTokens, tryRefreshSession } = await import('@/lib/auth-api')
    vi.useFakeTimers()
    try {
      const completed = vi.fn()
      const first = refreshSessionTokens('stalled-refresh-token').then(completed)
      const joined = tryRefreshSession()
      await vi.advanceTimersByTimeAsync(59_999)
      expect(completed).not.toHaveBeenCalled()
      expect(mockFetch).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1)
      expect(completed).toHaveBeenCalledWith({ outcome: 'retryable' })
      await first
      expect(await joined).toBeNull()
      expect(mockCookieStore.set).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)

      expect(await tryRefreshSession()).toBe(tokens.token)
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(mockCookieStore.set).toHaveBeenCalledWith(
        'refresh_token', tokens.refreshToken, expect.objectContaining({ maxAge: 60 * 60 * 24 * 365 }),
      )
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('preserves committed rotations beyond ten seconds and retries with the current cookie', async () => {
    const token = makeJwt(Math.floor(FIXED_NOW / 1000) + 900)
    const storedCookies = new Map([
      ['auth_token', makeJwt(Math.floor(FIXED_NOW / 1000) - 60)],
      ['refresh_token', 'old-refresh-token'],
    ])
    let serverRefreshToken = 'old-refresh-token'
    const sentRefreshTokens: string[] = []
    mockCookieStore.get.mockImplementation((name: string) => ({ value: storedCookies.get(name) }))
    mockCookieStore.set.mockImplementation((name: string, value: string) => { storedCookies.set(name, value) })
    mockFetch.mockImplementation((_url: string, options: RequestInit) => {
      const { refreshToken } = JSON.parse(options.body as string) as { refreshToken: string }
      sentRefreshTokens.push(refreshToken)
      if (refreshToken !== serverRefreshToken) return Promise.resolve(new Response(null, { status: 401 }))
      serverRefreshToken = `rotation-${sentRefreshTokens.length}`
      const response = Response.json({ token, refreshToken: serverRefreshToken })
      if (sentRefreshTokens.length > 1) return Promise.resolve(response)
      return new Promise<Response>((resolve, reject) => {
        setTimeout(() => resolve(response), 11_000)
        options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    })
    const { resolveServerSession } = await import('@/lib/auth-api')
    const first = resolveServerSession()
    await new Promise<void>((resolve) => setTimeout(resolve, 10_100))
    const joined = resolveServerSession()
    try {
      const outcomes = await Promise.all([first, joined])
      vi.useFakeTimers()
      await vi.advanceTimersByTimeAsync(30_000)
      const retry = await resolveServerSession({ forceRefresh: true })

      expect(outcomes.every((outcome) => outcome.refreshed && !outcome.refreshFailed)).toBe(true)
      expect(retry).toMatchObject({ token, refreshed: true, refreshFailed: false })
      expect(storedCookies.get('auth_token')).toBe(token)
      expect(storedCookies.get('refresh_token')).toBe('rotation-2')
      expect(sentRefreshTokens).toEqual(['old-refresh-token', 'rotation-1'])
    } finally {
      vi.useRealTimers()
    }
  }, 20_000)
})
