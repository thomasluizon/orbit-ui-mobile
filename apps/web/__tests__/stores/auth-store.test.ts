import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth-store'
import type { LoginResponse } from '@orbit/shared/types/auth'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('auth store', () => {
  beforeEach(() => {
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

  it('logs out and calls the BFF logout endpoint', async () => {
    mockFetch.mockResolvedValue({ ok: true })
    useAuthStore.getState().setAuth(makeLoginResponse())

    await useAuthStore.getState().logout()

    expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      expiresAt: null,
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

    it('skips interval polling when not authenticated', async () => {
      const cleanup = useAuthStore.getState().startExpiryMonitor()
      mockFetch.mockClear()

      await vi.advanceTimersByTimeAsync(60000)

      expect(mockFetch).not.toHaveBeenCalled()
      cleanup()
    })
  })
})
