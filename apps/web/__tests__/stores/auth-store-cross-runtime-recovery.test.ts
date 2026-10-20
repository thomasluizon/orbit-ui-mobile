import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth-store'
import type { LoginResponse } from '@orbit/shared/types/auth'
import { installWebLocks } from '../helpers/web-locks'

vi.mock('@/lib/posthog', () => ({ identifyPostHogUser: vi.fn(), resetPostHogUser: vi.fn() }))
const mockFetch = vi.fn()
function makeLoginResponse(): LoginResponse {
  return { userId: 'user-1', name: 'Alex', email: 'alex@example.com' }
}

beforeEach(() => {
  vi.useFakeTimers()
  installWebLocks()
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
  useAuthStore.setState({ isAuthenticated: false, sessionInactive: false, user: null, expiresAt: null, sessionRefreshFailed: false })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'locks')
})

describe('session recovery across independent runtimes', () => {
    it.each(['refresh', 'login'])('observes a %s cookie winner installed by a second runtime after rejection', async (winnerKind) => {
      vi.resetModules()
      const { useAuthStore: winnerTab } = await import('@/stores/auth-store')
      const { sessionAwareFetch: winnerFetch } = await import('@/lib/api-fetch')
      const { fetchAuthEndpoint: winnerLogin } = await import('@/app/(auth)/login/login-form-helpers')
      expect(winnerTab).not.toBe(useAuthStore)
      const loginResponse = makeLoginResponse()
      const expiresAt = Date.now() + 3600000
      let winnerCookiesInstalled = false
      mockFetch.mockImplementation((url: string) => {
        if (url === '/api/auth/verify-code' || url === '/api/profile') {
          winnerCookiesInstalled = true
          return Promise.resolve(Response.json(loginResponse))
        }
        return Promise.resolve(winnerCookiesInstalled
          ? Response.json({ expiresAt, userId: loginResponse.userId, refreshFailed: false })
          : Response.json({ expiresAt: null, refreshFailed: true }, { status: 401 }))
      })
      useAuthStore.getState().setAuth(loginResponse)
      const cleanup = useAuthStore.getState().startExpiryMonitor()
      try {
        await vi.advanceTimersByTimeAsync(0)
        expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, sessionRefreshFailed: true })
        if (winnerKind === 'login') {
          await winnerLogin('/api/auth/verify-code', { email: loginResponse.email, code: '123456' })
          winnerTab.getState().setAuth(loginResponse)
        } else {
          winnerTab.getState().setAuth(loginResponse)
          await winnerFetch('/api/profile')
        }
        await vi.advanceTimersByTimeAsync(60000)
        expect(useAuthStore.getState()).toMatchObject({
          isAuthenticated: true, sessionRefreshFailed: false, expiresAt,
          user: { userId: loginResponse.userId },
        })
      } finally {
        cleanup()
      }
    })

})
