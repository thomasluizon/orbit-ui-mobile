import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => {
  const router = {
    back: vi.fn(),
    replace: vi.fn(),
    push: vi.fn(),
    canGoBack: vi.fn(() => false),
  }

  return {
    router,
    dismissTopOverlay: vi.fn(() => false),
  }
})

vi.mock('expo-router', () => ({
  useRouter: () => mocks.router,
}))

vi.mock('@/lib/overlay-stack', () => ({
  dismissTopOverlay: mocks.dismissTopOverlay,
}))

import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'

type GoBackOrFallback = (
  fallbackRoute: string,
  options?: {
    dismissFirst?: boolean
    replace?: boolean
  },
) => void

async function renderHookHarness(): Promise<GoBackOrFallback> {
  let callback: GoBackOrFallback | null = null

  function Harness() {
    callback = useGoBackOrFallback() as GoBackOrFallback
    return null
  }

  await TestRenderer.act(async () => {
    TestRenderer.create(<Harness />)
    await Promise.resolve()
  })

  if (!callback) {
    throw new Error('Expected useGoBackOrFallback to initialize')
  }

  return callback
}

describe('mobile useGoBackOrFallback', () => {
  beforeEach(() => {
    mocks.router.back.mockClear()
    mocks.router.replace.mockClear()
    mocks.router.push.mockClear()
    mocks.router.canGoBack.mockReset()
    mocks.router.canGoBack.mockReturnValue(false)
    mocks.dismissTopOverlay.mockReset()
    mocks.dismissTopOverlay.mockReturnValue(false)
  })

  it('stops when dismissing the top overlay succeeds', async () => {
    mocks.dismissTopOverlay.mockReturnValue(true)
    const goBackOrFallback = await renderHookHarness()

    goBackOrFallback('/profile')

    expect(mocks.dismissTopOverlay).toHaveBeenCalledWith('navigation')
    expect(mocks.router.back).not.toHaveBeenCalled()
    expect(mocks.router.replace).not.toHaveBeenCalled()
  })

  it('uses router.back when native history is available', async () => {
    mocks.router.canGoBack.mockReturnValue(true)
    const goBackOrFallback = await renderHookHarness()

    goBackOrFallback('/profile')

    expect(mocks.router.back).toHaveBeenCalledTimes(1)
    expect(mocks.router.replace).not.toHaveBeenCalled()
  })

  it('replaces by default when no backward navigation is available', async () => {
    const goBackOrFallback = await renderHookHarness()

    goBackOrFallback('/profile', { dismissFirst: false })

    expect(mocks.router.replace).toHaveBeenCalledWith('/profile')
    expect(mocks.router.push).not.toHaveBeenCalled()
  })

  it('pushes only when replace is explicitly disabled', async () => {
    const goBackOrFallback = await renderHookHarness()

    goBackOrFallback('/profile', { dismissFirst: false, replace: false })

    expect(mocks.router.push).toHaveBeenCalledWith('/profile')
    expect(mocks.router.replace).not.toHaveBeenCalled()
  })
})
