import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ReferralRedirectScreen from '@/app/r/[code]'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  isAuthenticated: true,
  params: { code: 'orbit_123' },
  router: {
    replace: vi.fn(),
  },
}))

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => mocks.params,
  useRouter: () => mocks.router,
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => boolean) =>
    selector({ isAuthenticated: mocks.isAuthenticated }),
}))

describe('ReferralRedirectScreen', () => {
  beforeEach(() => {
    mocks.isAuthenticated = true
    mocks.router.replace.mockClear()
  })

  it('redirects an authenticated referral visit to Today at the root route', async () => {
    await TestRenderer.act(async () => {
      TestRenderer.create(<ReferralRedirectScreen />)
      await Promise.resolve()
    })

    expect(mocks.router.replace).toHaveBeenCalledWith('/')
  })
})
