import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getHeldAccountId, useAuthStore } from '@/stores/auth-store'
import { fetchAuthEndpoint } from '@/app/(auth)/login/login-form-helpers'
import type { LoginResponse } from '@orbit/shared/types/auth'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)
let lockQueue: Promise<unknown>

describe('auth store', () => {
  beforeEach(() => {
    lockQueue = Promise.resolve()
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: (_name: string, task: () => Promise<unknown>) => {
          const result = lockQueue.then(task)
          lockQueue = result.catch(() => {})
          return result
        },
      },
    })
    useAuthStore.setState({
      isAuthenticated: false,
      user: null,
      heldAccountId: null,
      expiresAt: null,
      sessionRefreshFailed: false,
    })
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ expiresAt: null }),
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'locks')
  })

  function makeLoginResponse(overrides: Partial<LoginResponse> = {}): LoginResponse {
    return {
      userId: 'user-1',
      name: 'Thomas',
      email: 'thomas@example.com',
      ...overrides,
    }
  }

  it('starts unauthenticated', () => {
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.user).toBeNull()
    expect(state.expiresAt).toBeNull()
  })

  it('sets authenticated state from LoginResponse', () => {
    useAuthStore.getState().setAuth(makeLoginResponse())

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      user: {
        userId: 'user-1',
        name: 'Thomas',
        email: 'thomas@example.com',
      },
    })
  })

  it('holds the account from a cold session read', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ expiresAt: Date.now() + 3600000, accountId: 'account-a' }),
    })

    await useAuthStore.getState().checkSession()

    expect(getHeldAccountId()).toBe('account-a')
  })

  it('keeps the previous account until a cross-tab replacement reloads the page', async () => {
    const previousLocation = globalThis.location
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    useAuthStore.getState().setAuth(makeLoginResponse({ userId: 'account-a' }))
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ expiresAt: Date.now() + 3600000, accountId: 'account-b' }),
    })

    await useAuthStore.getState().checkSession()

    expect(getHeldAccountId()).toBe('account-a')
    expect(reload).toHaveBeenCalledTimes(1)
    vi.stubGlobal('location', previousLocation)
  })

  it('logs out and calls the BFF logout endpoint', async () => {
    mockFetch.mockResolvedValue({ ok: true })
    useAuthStore.getState().setAuth(makeLoginResponse())

    await useAuthStore.getState().logout()

    expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      expiresAt: null,
      sessionRefreshFailed: false,
    })
  })

  it('removes the Supabase storage entry when the Orbit account changes', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://wdscxamegetmhqldqsdg.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'publishable-test-key'
    const key = 'sb-wdscxamegetmhqldqsdg-auth-token'
    useAuthStore.getState().setAuth(makeLoginResponse())
    localStorage.setItem(key, 'account-a-session')

    useAuthStore.getState().setAuth(makeLoginResponse({ userId: 'user-2' }))

    expect(localStorage.getItem(key)).toBeNull()
  })

  it('removes the Supabase storage entry on Orbit logout', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://wdscxamegetmhqldqsdg.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'publishable-test-key'
    const key = 'sb-wdscxamegetmhqldqsdg-auth-token'
    useAuthStore.getState().setAuth(makeLoginResponse())
    localStorage.setItem(key, 'account-a-session')

    await useAuthStore.getState().logout()

    expect(localStorage.getItem(key)).toBeNull()
  })

  it('keeps the session when browser cookie locking is unavailable', async () => {
    Reflect.deleteProperty(navigator, 'locks')
    useAuthStore.getState().setAuth(makeLoginResponse())

    await useAuthStore.getState().logout()
    await expect(fetchAuthEndpoint('/api/auth/verify-code', {
      email: 'thomas@example.com',
      code: '123456',
    })).rejects.toThrow('Web Locks API is required for session cookie changes')

    expect(mockFetch).not.toHaveBeenCalled()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('keeps a replacement login when an older logout response arrives', async () => {
    let releaseLogout!: () => void
    const logoutResponse = new Promise<{ ok: boolean }>((resolve) => {
      releaseLogout = () => resolve({ ok: true })
    })
    mockFetch.mockReturnValue(logoutResponse)
    useAuthStore.getState().setAuth(makeLoginResponse())

    const oldLogout = useAuthStore.getState().logout()
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' }))
    useAuthStore.getState().setAuth(makeLoginResponse({ userId: 'user-2', email: 'new@example.com' }))
    releaseLogout()
    await oldLogout

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      user: { userId: 'user-2', email: 'new@example.com' },
    })
  })

  it('does not adopt a session response that completes after logout', async () => {
    let releaseSession!: () => void
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/auth/session') {
        return new Promise((resolve) => {
          releaseSession = () => resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ expiresAt: Date.now() + 60000 }),
          })
        })
      }
      if (url === '/api/auth/logout') return Promise.resolve({ ok: true })
      throw new Error(`Unexpected auth endpoint: ${url}`)
    })
    useAuthStore.getState().setAuth(makeLoginResponse())

    const staleSession = useAuthStore.getState().checkSession()
    await vi.waitFor(() => expect(releaseSession).toBeTypeOf('function'))
    await useAuthStore.getState().logout()
    releaseSession()
    await staleSession

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('preserves replacement login cookies when an older logout response arrives', async () => {
    const browserCookies = new Map<string, string>([
      ['auth_token', 'old-access'],
      ['refresh_token', 'old-refresh'],
    ])
    let releaseLogout!: () => void
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/auth/logout') {
        return new Promise((resolve) => {
          releaseLogout = () => {
            browserCookies.clear()
            resolve({ ok: true })
          }
        })
      }
      if (url === '/api/auth/verify-code') {
        browserCookies.set('auth_token', 'new-access')
        browserCookies.set('refresh_token', 'new-refresh')
        return Promise.resolve({ ok: true, json: () => Promise.resolve(makeLoginResponse()) })
      }
      throw new Error(`Unexpected auth endpoint: ${url}`)
    })
    useAuthStore.getState().setAuth(makeLoginResponse())

    const oldLogout = useAuthStore.getState().logout()
    const replacementLogin = fetchAuthEndpoint('/api/auth/verify-code', {
      email: 'thomas@example.com',
      code: '123456',
    })
    await Promise.resolve()
    releaseLogout()
    await Promise.all([oldLogout, replacementLogin])

    expect(browserCookies.get('auth_token')).toBe('new-access')
    expect(browserCookies.get('refresh_token')).toBe('new-refresh')
  })

  it('preserves replacement cookies when logout and login run in separate tabs', async () => {
    const browserCookies = new Map<string, string>([
      ['auth_token', 'old-access'],
      ['refresh_token', 'old-refresh'],
    ])
    let releaseLogout!: () => void
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/auth/logout') {
        return new Promise((resolve) => {
          releaseLogout = () => {
            browserCookies.clear()
            resolve({ ok: true })
          }
        })
      }
      if (url === '/api/auth/verify-code') {
        browserCookies.set('auth_token', 'new-access')
        browserCookies.set('refresh_token', 'new-refresh')
        return Promise.resolve({ ok: true, json: () => Promise.resolve(makeLoginResponse()) })
      }
      throw new Error(`Unexpected auth endpoint: ${url}`)
    })

    vi.resetModules()
    const firstTab = await import('@/stores/auth-store')
    firstTab.useAuthStore.getState().setAuth(makeLoginResponse())
    const oldLogout = firstTab.useAuthStore.getState().logout()
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' }))

    vi.resetModules()
    const secondTab = await import('@/app/(auth)/login/login-form-helpers')
    const replacementLogin = secondTab.fetchAuthEndpoint('/api/auth/verify-code', {
      email: 'thomas@example.com',
      code: '123456',
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    releaseLogout()
    await Promise.all([oldLogout, replacementLogin])

    expect(browserCookies.get('auth_token')).toBe('new-access')
    expect(browserCookies.get('refresh_token')).toBe('new-refresh')
  })

  it('marks the session as signed out after confirming a refresh rejection', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ expiresAt: null, refreshFailed: true }),
    })
    useAuthStore.getState().setAuth(makeLoginResponse())

    await useAuthStore.getState().confirmSessionRefreshFailure()

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      expiresAt: null,
      sessionRefreshFailed: true,
    })
  })

  it('updates expiresAt from the session response', async () => {
    const expiresAt = Date.now() + 3600000
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ expiresAt }),
    })
    useAuthStore.getState().setAuth(makeLoginResponse())

    await useAuthStore.getState().checkSession()

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      expiresAt,
      sessionRefreshFailed: false,
    })
  })

  it('clears auth state when the session response has no active expiry', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ expiresAt: null }),
    })
    useAuthStore.getState().setAuth(makeLoginResponse())

    await useAuthStore.getState().checkSession()

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      expiresAt: null,
      sessionRefreshFailed: false,
    })
  })

  it('keeps the current state on network errors', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    useAuthStore.getState().setAuth(makeLoginResponse())

    await useAuthStore.getState().checkSession()

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      user: expect.objectContaining({ userId: 'user-1' }),
    })
  })

  it('clears the session on a 401 response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ expiresAt: null, refreshFailed: true }),
    })
    useAuthStore.getState().setAuth(makeLoginResponse())

    await useAuthStore.getState().checkSession()

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      expiresAt: null,
      sessionRefreshFailed: true,
    })
  })

  it('keeps the current state on a transient server error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ expiresAt: null }),
    })
    useAuthStore.getState().setAuth(makeLoginResponse())

    await useAuthStore.getState().checkSession()

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      user: expect.objectContaining({ userId: 'user-1' }),
    })
  })

  describe('startExpiryMonitor', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns a cleanup function and checks the session immediately', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ expiresAt: Date.now() + 3600000 }),
      })
      useAuthStore.getState().setAuth(makeLoginResponse())

      const cleanup = useAuthStore.getState().startExpiryMonitor()
      await vi.runOnlyPendingTimersAsync()

      expect(typeof cleanup).toBe('function')
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/session')
      cleanup()
    })

    it('polls the session endpoint every minute while authenticated', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ expiresAt: Date.now() + 3600000 }),
      })
      useAuthStore.getState().setAuth(makeLoginResponse())

      const cleanup = useAuthStore.getState().startExpiryMonitor()
      await vi.runOnlyPendingTimersAsync()
      mockFetch.mockClear()

      await vi.advanceTimersByTimeAsync(60000)

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/session')
      cleanup()
    })

    it('keeps polling after a retryable 401 and recovers on the next check', async () => {
      const expiresAt = Date.now() + 3600000
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ expiresAt: null, refreshFailed: false }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ expiresAt, refreshFailed: false }),
        })
      useAuthStore.getState().setAuth(makeLoginResponse())

      const cleanup = useAuthStore.getState().startExpiryMonitor()
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

      expect(useAuthStore.getState().isAuthenticated).toBe(true)

      await vi.advanceTimersByTimeAsync(60000)

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(useAuthStore.getState()).toMatchObject({
        isAuthenticated: true,
        expiresAt,
        sessionRefreshFailed: false,
      })
      cleanup()
    })

    it('keeps polling after a confirmed failure so a delayed winner can recover', async () => {
      const expiresAt = Date.now() + 3600000
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ expiresAt, refreshFailed: false }),
      })
      useAuthStore.getState().setAuth(makeLoginResponse())

      const cleanup = useAuthStore.getState().startExpiryMonitor()
      await vi.waitFor(() => expect(useAuthStore.getState().expiresAt).toBe(expiresAt))
      mockFetch.mockClear()
      useAuthStore.setState({
        isAuthenticated: false,
        user: null,
        expiresAt: null,
        sessionRefreshFailed: true,
      })

      await vi.advanceTimersByTimeAsync(60000)

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(useAuthStore.getState()).toMatchObject({
        isAuthenticated: true,
        expiresAt,
        sessionRefreshFailed: false,
      })
      cleanup()
    })

    it('skips interval polling when not authenticated', async () => {
      const cleanup = useAuthStore.getState().startExpiryMonitor()
      mockFetch.mockClear()

      await vi.advanceTimersByTimeAsync(60000)

      expect(mockFetch).not.toHaveBeenCalled()
      cleanup()
    })
  })
})
