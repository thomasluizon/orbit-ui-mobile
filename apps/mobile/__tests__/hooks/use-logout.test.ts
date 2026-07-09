import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useLogout } from '@/hooks/use-logout'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  logout: vi.fn(),
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { logout: () => Promise<void> }) => unknown) =>
    selector({ logout: mocks.logout }),
}))

function renderHookValue<T>(hook: () => T): T {
  let value!: T
  function Probe() {
    value = hook()
    return null
  }
  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(Probe))
  })
  return value
}

beforeEach(() => {
  mocks.replace.mockReset()
  mocks.logout.mockReset()
  mocks.logout.mockResolvedValue(undefined)
})

describe('useLogout (mobile)', () => {
  it('signs out then routes to the login screen', async () => {
    const logoutAndRedirect = renderHookValue(() => useLogout())

    await logoutAndRedirect()

    expect(mocks.logout).toHaveBeenCalledTimes(1)
    expect(mocks.replace).toHaveBeenCalledWith('/login')
  })

  it('navigates only after session teardown resolves', async () => {
    const order: string[] = []
    mocks.logout.mockImplementation(async () => {
      order.push('logout')
    })
    mocks.replace.mockImplementation(() => {
      order.push('replace')
    })

    const logoutAndRedirect = renderHookValue(() => useLogout())
    await logoutAndRedirect()

    expect(order).toEqual(['logout', 'replace'])
  })
})
