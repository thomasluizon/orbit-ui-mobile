import React from 'react'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const router = {
    back: vi.fn(),
    replace: vi.fn(),
    push: vi.fn(),
  }

  return {
    router,
    useRouter: vi.fn(() => router),
    canGoBackInAppHistory: vi.fn(() => false),
    dismissTopOverlay: vi.fn(() => false),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: mocks.useRouter,
}))

vi.mock('@/lib/app-navigation-history', () => ({
  canGoBackInAppHistory: mocks.canGoBackInAppHistory,
}))

vi.mock('@/lib/overlay-stack', () => ({
  dismissTopOverlay: mocks.dismissTopOverlay,
}))

import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'

function renderHookHarness() {
  let callback: ReturnType<typeof useGoBackOrFallback> | null = null

  function Harness() {
    callback = useGoBackOrFallback()
    return null
  }

  render(<Harness />)
  return callback
}

describe('useGoBackOrFallback', () => {
  beforeEach(() => {
    mocks.router.back.mockClear()
    mocks.router.replace.mockClear()
    mocks.router.push.mockClear()
    mocks.useRouter.mockClear()
    mocks.canGoBackInAppHistory.mockReset()
    mocks.canGoBackInAppHistory.mockReturnValue(false)
    mocks.dismissTopOverlay.mockReset()
    mocks.dismissTopOverlay.mockReturnValue(false)

    Object.defineProperty(globalThis.history, 'length', {
      configurable: true,
      value: 1,
    })
    Object.defineProperty(globalThis.document, 'referrer', {
      configurable: true,
      value: '',
    })
  })

  it('stops when dismissing the top overlay succeeds', async () => {
    mocks.dismissTopOverlay.mockReturnValue(true)
    const goBackOrFallback = await renderHookHarness()

    goBackOrFallback?.('/profile')

    expect(mocks.dismissTopOverlay).toHaveBeenCalledWith('navigation')
    expect(mocks.router.back).not.toHaveBeenCalled()
    expect(mocks.router.replace).not.toHaveBeenCalled()
  })

  it('uses router.back when app history says navigation can go back', async () => {
    mocks.canGoBackInAppHistory.mockReturnValue(true)
    const goBackOrFallback = await renderHookHarness()

    goBackOrFallback?.('/profile')

    expect(mocks.router.back).toHaveBeenCalledTimes(1)
  })

  it('uses router.back when the browser history and referrer are same-origin', async () => {
    Object.defineProperty(globalThis.history, 'length', {
      configurable: true,
      value: 2,
    })
    Object.defineProperty(globalThis.document, 'referrer', {
      configurable: true,
      value: `${globalThis.location.origin}/today`,
    })
    const goBackOrFallback = await renderHookHarness()

    goBackOrFallback?.('/profile', { dismissFirst: false })

    expect(mocks.dismissTopOverlay).not.toHaveBeenCalled()
    expect(mocks.router.back).toHaveBeenCalledTimes(1)
  })

  it('falls back to replace or push when no backward navigation is available', async () => {
    Object.defineProperty(globalThis.document, 'referrer', {
      configurable: true,
      value: 'not-a-valid-url',
    })
    const goBackOrFallback = await renderHookHarness()

    goBackOrFallback?.('/profile', { dismissFirst: false })
    goBackOrFallback?.('/settings', { dismissFirst: false, replace: false })

    expect(mocks.router.replace).toHaveBeenCalledWith('/profile')
    expect(mocks.router.push).toHaveBeenCalledWith('/settings')
  })
})
