import React from 'react'
import { Animated } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { LoginStepStage } from '@/components/auth/login-sections'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({ reduced: false, enterDuration: 300, shift: 20 }))
const bezier = vi.hoisted(() => ({ received: [] as unknown[] }))
vi.mock('@/lib/motion', async () => {
  const shared = await import('@orbit/shared/theme')
  return {
    toAnimatedEasing: (controlPoints: unknown) => { bezier.received.push(controlPoints); return undefined },
    usePrefersReducedMotion: () => mocks.reduced,
    useResolvedMotionPreset: () => ({ ...shared.resolveMotionPreset('route-replace', mocks.reduced), enterDuration: mocks.enterDuration, shift: mocks.shift }),
  }
})

async function renderStep(step: string) {
  let tree!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => { tree = TestRenderer.create(<LoginStepStage step={step}>body</LoginStepStage>) })
  return tree
}

describe('LoginStepStage motion', () => {
  let timing: ReturnType<typeof vi.spyOn>
  let interpolate: ReturnType<typeof vi.spyOn>
  beforeEach(() => { mocks.reduced = false; bezier.received = []; timing = vi.spyOn(Animated, 'timing'); interpolate = vi.spyOn(Animated.Value.prototype, 'interpolate') })
  afterEach(() => { timing.mockRestore(); interpolate.mockRestore() })

  it('takes the duration, easing and shift from the shared preset', async () => {
    const tree = await renderStep('email')
    await TestRenderer.act(() => { tree.update(<LoginStepStage step="code">body</LoginStepStage>) })
    expect(timing).toHaveBeenCalledOnce()
    expect(timing.mock.calls[0]![1]).toMatchObject({ toValue: 1, duration: 300, useNativeDriver: true })
    expect(bezier.received).toEqual([[...resolveMotionPreset('route-replace', false).enterEasing]])
    expect(interpolate).toHaveBeenCalledWith({ inputRange: [0, 1], outputRange: [20, 0] })
  })

  it('changes at once under reduced motion', async () => {
    mocks.reduced = true
    const tree = await renderStep('email')
    await TestRenderer.act(() => { tree.update(<LoginStepStage step="code">body</LoginStepStage>) })
    expect(timing).not.toHaveBeenCalled()
  })
})
