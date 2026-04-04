import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAuthStore } from '@/stores/auth-store'
import type { LoginResponse } from '@orbit/shared/types/auth'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('auth store', () => {
  beforeEach(() => {
    // Reset store state between tests
    useAuthStore.setState({
      isAuthenticated: false,
      user: null,
      expiresAt: null,
    })
    mockFetch.mockReset()
  })

  function makeLoginResponse(overrides: Partial<LoginResponse> = {}): LoginResponse {
    return {
      userId: 'user-1',
      name: 'Thomas',
      email: 'thomas@example.com',
      ...overrides,
    }
  }

  describe('initial state', () => {
    it('starts unauthenticated', () => {
      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(false)
      expect(state.user).toBeNull()
      expect(state.expiresAt).toBeNull()
    })
  })

  describe('setAuth', () => {
    it('sets authenticated state from LoginResponse', () => {
      const { setAuth } = useAuthStore.getState()
      setAuth(makeLoginResponse())

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(true)
      expect(state.user).toEqual({
        userId: 'user-1',
        name: 'Thomas',
        email: 'thomas@example.com',
      })
    })

    it('overwrites previous user on re-login', () => {
      const { setAuth } = useAuthStore.getState()
      setAuth(makeLoginResponse({ userId: 'user-1', name: 'Alice' }))
      setAuth(makeLoginResponse({ userId: 'user-2', name: 'Bob' }))

      const state = useAuthStore.getState()
      expect(state.user?.userId).toBe('user-2')
      expect(state.user?.name).toBe('Bob')
    })
  })

  describe('logout', () => {
    it('clears user state', async () => {
      mockFetch.mockResolvedValue({ ok: true })

      const { setAuth, logout } = useAuthStore.getState()
      setAuth(makeLoginResponse())

      await logout()

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(false)
      expect(state.user).toBeNull()
      expect(state.expiresAt).toBeNull()
    })

    it('calls BFF logout endpoint', async () => {
      mockFetch.mockResolvedValue({ ok: true })

      const { setAuth, logout } = useAuthStore.getState()
      setAuth(makeLoginResponse())

      await logout()

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
    })

    it('still logs out if BFF logout fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const { setAuth, logout } = useAuthStore.getState()
      setAuth(makeLoginResponse())

      await logout()

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(false)
      expect(state.user).toBeNull()
    })
  })

  describe('checkSession', () => {
    it('updates expiresAt from session response', async () => {
      const expiresAt = Date.now() + 60 * 60 * 1000 // 1 hour from now
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ expiresAt }),
      })

      const { setAuth, checkSession } = useAuthStore.getState()
      setAuth(makeLoginResponse())

      await checkSession()

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(true)
      expect(state.expiresAt).toBe(expiresAt)
    })

    it('logs out when session response has no expiresAt', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ expiresAt: null }),
      })

      const { setAuth, checkSession } = useAuthStore.getState()
      setAuth(makeLoginResponse())

      await checkSession()

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(false)
      expect(state.user).toBeNull()
    })

    it('logs out on non-OK response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({}),
      })

      const { setAuth, checkSession } = useAuthStore.getState()
      setAuth(makeLoginResponse())

      await checkSession()

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(false)
    })

    it('keeps current state on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const { setAuth, checkSession } = useAuthStore.getState()
      setAuth(makeLoginResponse())

      await checkSession()

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(true)
      expect(state.user).not.toBeNull()
    })
  })

  describe('startExpiryMonitor', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns a cleanup function', () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ expiresAt: Date.now() + 3600000 }),
      })

      const { startExpiryMonitor } = useAuthStore.getState()
      const cleanup = startExpiryMonitor()

      expect(typeof cleanup).toBe('function')
      cleanup()
    })

    it('triggers checkSession immediately', () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ expiresAt: Date.now() + 3600000 }),
      })

      const { startExpiryMonitor } = useAuthStore.getState()
      const cleanup = startExpiryMonitor()

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/session')
      cleanup()
    })

    it('auto-logouts when expiry time passes', async () => {
      const now = Date.now()
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ expiresAt: now + 30000 }), // 30s
        })
        .mockResolvedValue({ ok: true }) // logout call

      const { setAuth, startExpiryMonitor } = useAuthStore.getState()
      setAuth(makeLoginResponse())

      // Simulate the session check resolving
      useAuthStore.setState({ expiresAt: now - 1000 }) // Already expired

      const cleanup = startExpiryMonitor()

      // Advance past the check interval (60s)
      await vi.advanceTimersByTimeAsync(61000)

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(false)
      cleanup()
    })
  })
})
