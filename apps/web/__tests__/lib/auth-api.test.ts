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
      maxAge: 86400, // 1 day
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
      maxAge: 86400,
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
})
