import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => {
  const router = {
    push: vi.fn(),
    dismiss: vi.fn(),
    dismissTo: vi.fn(),
    canDismiss: vi.fn(() => false),
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
    mocks.router.push.mockClear()
    mocks.router.dismiss.mockClear()
    mocks.router.dismissTo.mockClear()
    mocks.router.canDismiss.mockReset()
    mocks.router.canDismiss.mockReturnValue(false)
    mocks.dismissTopOverlay.mockReset()
    mocks.dismissTopOverlay.mockReturnValue(false)
  })

  it('stops when dismissing the top overlay succeeds', async () => {
    mocks.dismissTopOverlay.mockReturnValue(true)
    const goBackOrFallback = await renderHookHarness()

    goBackOrFallback('/profile')

    expect(mocks.dismissTopOverlay).toHaveBeenCalledWith('navigation')
    expect(mocks.router.dismiss).not.toHaveBeenCalled()
    expect(mocks.router.dismissTo).not.toHaveBeenCalled()
  })

  it('dismisses the current screen when stack history is available', async () => {
    mocks.router.canDismiss.mockReturnValue(true)
    const goBackOrFallback = await renderHookHarness()

    goBackOrFallback('/profile')

    expect(mocks.router.dismiss).toHaveBeenCalledTimes(1)
    expect(mocks.router.dismissTo).not.toHaveBeenCalled()
  })

  it('dismisses to the fallback route by default when no stack history is available', async () => {
    const goBackOrFallback = await renderHookHarness()

    goBackOrFallback('/profile', { dismissFirst: false })

    expect(mocks.router.dismissTo).toHaveBeenCalledWith('/profile')
    expect(mocks.router.push).not.toHaveBeenCalled()
  })

  it('pushes only when replace is explicitly disabled', async () => {
    const goBackOrFallback = await renderHookHarness()

    goBackOrFallback('/profile', { dismissFirst: false, replace: false })

    expect(mocks.router.push).toHaveBeenCalledWith('/profile')
    expect(mocks.router.dismissTo).not.toHaveBeenCalled()
  })
})
