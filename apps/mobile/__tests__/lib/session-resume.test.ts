import { beforeEach, describe, expect, it, vi } from 'vitest'

import { reconcileSessionOnForeground } from '@/lib/session-resume'

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  checkAuth: vi.fn(),
  isAuthenticated: false,
}))

vi.mock('expo-router', () => ({
  router: { replace: mocks.replace },
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: {
    getState: () => ({
      isAuthenticated: mocks.isAuthenticated,
      checkAuth: mocks.checkAuth,
    }),
  },
}))

beforeEach(() => {
  mocks.replace.mockReset()
  mocks.checkAuth.mockReset()
  mocks.checkAuth.mockResolvedValue(true)
  mocks.isAuthenticated = false
})

describe('reconcileSessionOnForeground (mobile)', () => {
  it('routes to /login when a foreground refresh clears an authenticated session', async () => {
    mocks.isAuthenticated = true
    mocks.checkAuth.mockImplementation(async () => {
      mocks.isAuthenticated = false
      return false
    })

    await reconcileSessionOnForeground()

    expect(mocks.checkAuth).toHaveBeenCalledTimes(1)
    expect(mocks.replace).toHaveBeenCalledWith('/login')
  })

  it('does not redirect when the session survives the foreground check', async () => {
    mocks.isAuthenticated = true
    mocks.checkAuth.mockResolvedValue(true)

    await reconcileSessionOnForeground()

    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('does not redirect a user who was already signed out', async () => {
    mocks.isAuthenticated = false

    await reconcileSessionOnForeground()

    expect(mocks.replace).not.toHaveBeenCalled()
  })
})
