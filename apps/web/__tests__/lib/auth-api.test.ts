import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock cookies store
const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
}

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}))

// Mock global fetch for tryRefreshSession
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import {
  getAuthHeaders,
  getAuthToken,
  getRefreshToken,
  setAuthCookie,
  setRefreshCookie,
  setSessionCookies,
  clearSessionCookies,
  tryRefreshSession,
  __resetRefreshInflightForTests,
} from '@/lib/auth-api'

describe('getAuthHeaders', () => {
  beforeEach(() => {
    mockCookieStore.get.mockReset()
    mockCookieStore.set.mockReset()
  })

  it('returns Bearer header when auth token exists', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'test-jwt-token' })

    const headers = await getAuthHeaders()
    expect(headers).toEqual({ Authorization: 'Bearer test-jwt-token' })
    expect(mockCookieStore.get).toHaveBeenCalledWith('auth_token')
  })

  it('returns empty object when no auth token', async () => {
    mockCookieStore.get.mockReturnValue(undefined)

    const headers = await getAuthHeaders()
    expect(headers).toEqual({})
  })
})

describe('getAuthToken', () => {
  beforeEach(() => {
    mockCookieStore.get.mockReset()
  })

  it('returns token string when present', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'my-token' })

    const token = await getAuthToken()
    expect(token).toBe('my-token')
  })

  it('returns null when token is missing', async () => {
    mockCookieStore.get.mockReturnValue(undefined)

    const token = await getAuthToken()
    expect(token).toBeNull()
  })
})

describe('getRefreshToken', () => {
  beforeEach(() => {
    mockCookieStore.get.mockReset()
  })

  it('returns refresh token string when present', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'refresh-abc' })

    const token = await getRefreshToken()
    expect(token).toBe('refresh-abc')
    expect(mockCookieStore.get).toHaveBeenCalledWith('refresh_token')
  })

  it('returns null when refresh token is missing', async () => {
    mockCookieStore.get.mockReturnValue(undefined)

    const token = await getRefreshToken()
    expect(token).toBeNull()
  })
})

describe('setAuthCookie', () => {
  beforeEach(() => {
    mockCookieStore.set.mockReset()
  })

  it('sets auth_token with correct options', async () => {
    await setAuthCookie('new-jwt')

    expect(mockCookieStore.set).toHaveBeenCalledWith('auth_token', 'new-jwt', {
      httpOnly: true,
      sameSite: 'strict',
      secure: true,
      path: '/',
      maxAge: 604800, // 7 days (matches backend JWT lifetime)
    })
  })
})

describe('setRefreshCookie', () => {
  beforeEach(() => {
    mockCookieStore.set.mockReset()
  })

  it('sets refresh_token with correct options', async () => {
    await setRefreshCookie('new-refresh')

    expect(mockCookieStore.set).toHaveBeenCalledWith('refresh_token', 'new-refresh', {
      httpOnly: true,
      sameSite: 'strict',
      secure: true,
      path: '/',
      maxAge: 2592000, // 30 days
    })
  })
})

describe('setSessionCookies', () => {
  beforeEach(() => {
    mockCookieStore.set.mockReset()
  })

  it('sets both auth and refresh cookies', async () => {
    await setSessionCookies('jwt-123', 'refresh-456')

    expect(mockCookieStore.set).toHaveBeenCalledTimes(2)
    expect(mockCookieStore.set).toHaveBeenCalledWith('auth_token', 'jwt-123', expect.objectContaining({
      httpOnly: true,
      maxAge: 604800,
    }))
    expect(mockCookieStore.set).toHaveBeenCalledWith('refresh_token', 'refresh-456', expect.objectContaining({
      httpOnly: true,
      maxAge: 2592000,
    }))
  })

  it('only sets auth cookie when refresh token is null', async () => {
    await setSessionCookies('jwt-123', null)

    expect(mockCookieStore.set).toHaveBeenCalledTimes(1)
    expect(mockCookieStore.set).toHaveBeenCalledWith('auth_token', 'jwt-123', expect.any(Object))
  })
})

describe('clearSessionCookies', () => {
  beforeEach(() => {
    mockCookieStore.set.mockReset()
  })

  it('sets both cookies to empty string with maxAge 0', async () => {
    await clearSessionCookies()

    expect(mockCookieStore.set).toHaveBeenCalledTimes(2)
    expect(mockCookieStore.set).toHaveBeenCalledWith('auth_token', '', expect.objectContaining({
      maxAge: 0,
    }))
    expect(mockCookieStore.set).toHaveBeenCalledWith('refresh_token', '', expect.objectContaining({
      maxAge: 0,
    }))
  })
})

describe('tryRefreshSession', () => {
  beforeEach(() => {
    mockCookieStore.get.mockReset()
    mockCookieStore.set.mockReset()
    mockFetch.mockReset()
    __resetRefreshInflightForTests()
  })

  it('returns null and clears cookies when no refresh token', async () => {
    // First call: getRefreshToken (refresh_token), then clearSessionCookies calls
    mockCookieStore.get.mockReturnValue(undefined)

    const result = await tryRefreshSession()
    expect(result).toBeNull()
  })

  it('refreshes tokens on successful API call', async () => {
    // getRefreshToken returns the token
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === 'refresh_token') return { value: 'old-refresh' }
      return undefined
    })

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: 'new-jwt', refreshToken: 'new-refresh' }),
    })

    const result = await tryRefreshSession()
    expect(result).toBe('new-jwt')
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:5000/api/auth/refresh',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: 'old-refresh' }),
      }),
    )
  })

  it('clears cookies and returns null on failed refresh', async () => {
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === 'refresh_token') return { value: 'expired-refresh' }
      return undefined
    })

    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
    })

    const result = await tryRefreshSession()
    expect(result).toBeNull()
  })

  it('clears cookies and returns null on network error', async () => {
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === 'refresh_token') return { value: 'some-refresh' }
      return undefined
    })

    mockFetch.mockRejectedValue(new Error('Network error'))

    const result = await tryRefreshSession()
    expect(result).toBeNull()
  })

  it('dedupes 5 concurrent refreshes into a single network call (single-flight mutex)', async () => {
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === 'refresh_token') return { value: 'shared-refresh' }
      return undefined
    })

    // Pin the fetch resolution behind a deferred so we can prove all 5
    // callers are awaiting the same promise before any of them resolve.
    let resolveFetch!: (val: unknown) => void
    const fetchPromise = new Promise((resolve) => { resolveFetch = resolve })
    mockFetch.mockReturnValue(fetchPromise)

    const callers = Array.from({ length: 5 }, () => tryRefreshSession())

    // tryRefreshSession awaits getRefreshToken (cookie read) before it
    // issues the underlying fetch. Let the microtask queue drain so all
    // 5 callers reach the single-flight check before we assert.
    await new Promise((r) => setTimeout(r, 0))

    // All 5 callers in flight; only one network call should have happened.
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Resolve the single underlying refresh.
    resolveFetch({
      ok: true,
      json: () => Promise.resolve({ token: 'new-jwt', refreshToken: 'new-refresh' }),
    })

    const results = await Promise.all(callers)
    expect(results).toEqual(['new-jwt', 'new-jwt', 'new-jwt', 'new-jwt', 'new-jwt'])
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('starts a fresh flight after the previous one resolved', async () => {
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === 'refresh_token') return { value: 'shared-refresh' }
      return undefined
    })

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: 'jwt-1', refreshToken: 'refresh-2' }),
    })

    await tryRefreshSession()

    // After the first flight settled, a second call should issue a new
    // network refresh — not silently re-use the resolved promise.
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === 'refresh_token') return { value: 'refresh-2' }
      return undefined
    })
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: 'jwt-2', refreshToken: 'refresh-3' }),
    })

    const result = await tryRefreshSession()
    expect(result).toBe('jwt-2')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})
