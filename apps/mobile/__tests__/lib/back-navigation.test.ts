import { describe, expect, it, vi } from 'vitest'
import {
  dismissOrFallback,
  getAndroidBackFallbackRoute,
} from '@/lib/back-navigation'

function createRouterMock() {
  return {
    canDismiss: vi.fn(() => false),
    dismiss: vi.fn(),
    dismissTo: vi.fn(),
    push: vi.fn(),
  }
}

describe('mobile back navigation helpers', () => {
  it('dismisses when a stack entry is available', () => {
    const router = createRouterMock()
    router.canDismiss.mockReturnValue(true)

    dismissOrFallback(router, '/profile')

    expect(router.dismiss).toHaveBeenCalledTimes(1)
    expect(router.dismissTo).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('dismisses to the fallback route when no stack entry is available', () => {
    const router = createRouterMock()

    dismissOrFallback(router, '/profile')

    expect(router.dismiss).not.toHaveBeenCalled()
    expect(router.dismissTo).toHaveBeenCalledWith('/profile')
    expect(router.push).not.toHaveBeenCalled()
  })

  it('pushes only when replace-style fallback is explicitly disabled', () => {
    const router = createRouterMock()

    dismissOrFallback(router, '/profile', { replace: false })

    expect(router.dismiss).not.toHaveBeenCalled()
    expect(router.dismissTo).not.toHaveBeenCalled()
    expect(router.push).toHaveBeenCalledWith('/profile')
  })

  it('maps top-level app screens to deterministic Android fallbacks', () => {
    expect(getAndroidBackFallbackRoute('/chat')).toBe('/')
    expect(getAndroidBackFallbackRoute('/profile')).toBe('/')
    expect(getAndroidBackFallbackRoute('/preferences')).toBe('/profile')
  })

  it('uses auth-aware privacy fallbacks', () => {
    expect(
      getAndroidBackFallbackRoute('/privacy', { isAuthenticated: true }),
    ).toBe('/')
    expect(
      getAndroidBackFallbackRoute('/privacy', { isAuthenticated: false }),
    ).toBe('/login')
  })

  it('reuses the upgrade origin route when available', () => {
    expect(
      getAndroidBackFallbackRoute('/upgrade', {
        upgradeFrom: '/achievements',
      }),
    ).toBe('/achievements')
    expect(
      getAndroidBackFallbackRoute('/upgrade', {
        upgradeFrom: ['/retrospective'],
      }),
    ).toBe('/retrospective')
    expect(getAndroidBackFallbackRoute('/upgrade')).toBe('/profile')
  })

  it('leaves unknown routes to the native back behavior', () => {
    expect(getAndroidBackFallbackRoute('/login')).toBeNull()
    expect(getAndroidBackFallbackRoute('/unknown')).toBeNull()
  })
})
