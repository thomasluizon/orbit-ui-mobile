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
  useAuthStore: (selector: (state: { logout: () => Promise<boolean> }) => unknown) =>
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
  mocks.logout.mockResolvedValue(true)
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
    mocks.logout.mockImplementation(() => {
      order.push('logout')
      return Promise.resolve(true)
    })
    mocks.replace.mockImplementation(() => {
      order.push('replace')
    })

    const logoutAndRedirect = renderHookValue(() => useLogout())
    await logoutAndRedirect()

    expect(order).toEqual(['logout', 'replace'])
  })

  it('does not route when logout teardown rejects', async () => {
    mocks.logout.mockRejectedValue(new Error('teardown failed'))

    const logoutAndRedirect = renderHookValue(() => useLogout())
    await expect(logoutAndRedirect()).rejects.toThrow('teardown failed')

    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('does not route when logout refuses stale session authority', async () => {
    mocks.logout.mockResolvedValue(false)

    const logoutAndRedirect = renderHookValue(() => useLogout())
    await logoutAndRedirect()

    expect(mocks.replace).not.toHaveBeenCalled()
  })
})
