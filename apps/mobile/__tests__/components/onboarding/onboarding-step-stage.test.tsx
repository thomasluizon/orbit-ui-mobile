import React from 'react'
import { Animated } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { motionDurations, motionEasings, motionLayerTiming } from '@orbit/shared/theme'
import { OnboardingStepStage } from '@/components/onboarding/onboarding-step-stage'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({ reduced: false }))
const bezier = vi.hoisted(() => ({ received: [] as unknown[] }))
vi.mock('@/lib/motion', () => ({
  toAnimatedEasing: (controlPoints: unknown) => { bezier.received.push(controlPoints); return undefined },
  usePrefersReducedMotion: () => mocks.reduced,
}))

async function renderStage(step: number) {
  let tree!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => {
    tree = TestRenderer.create(<OnboardingStepStage step={step}>body</OnboardingStepStage>)
  })
  return tree
}

describe('OnboardingStepStage', () => {
  let timing: ReturnType<typeof vi.spyOn>
  let interpolate: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    mocks.reduced = false
    bezier.received = []
    timing = vi.spyOn(Animated, 'timing')
    interpolate = vi.spyOn(Animated.Value.prototype, 'interpolate')
  })
  afterEach(() => { timing.mockRestore(); interpolate.mockRestore() })

  it('leaves the step that opens the flow still', async () => {
    await renderStage(0)
    expect(timing).not.toHaveBeenCalled()
  })

  it('enters a changed step with the base duration, enter easing and the shared shift', async () => {
    const tree = await renderStage(0)
    await TestRenderer.act(() => { tree.update(<OnboardingStepStage step={1}>body</OnboardingStepStage>) })
    expect(timing).toHaveBeenCalledOnce()
    expect(timing.mock.calls[0]![1]).toMatchObject({ toValue: 1, duration: motionDurations.base, useNativeDriver: true })
    expect(bezier.received).toEqual([[...motionEasings.enter]])
    expect(interpolate).toHaveBeenCalledWith({ inputRange: [0, 1], outputRange: [motionLayerTiming.routeShift, 0] })
  })

  it('takes the duration and the curve from the shared tokens', async () => {
    const durations = motionDurations as unknown as Record<string, number>
    const easings = motionEasings as unknown as Record<string, readonly number[]>
    const originalBase = durations.base
    const originalEnter = easings.enter
    durations.base = 333
    easings.enter = [0.1, 0.2, 0.3, 0.4]
    try {
      const tree = await renderStage(0)
      await TestRenderer.act(() => { tree.update(<OnboardingStepStage step={1}>body</OnboardingStepStage>) })
      expect(timing.mock.calls[0]![1]).toMatchObject({ duration: 333 })
      expect(bezier.received).toEqual([[0.1, 0.2, 0.3, 0.4]])
    } finally {
      durations.base = originalBase!
      easings.enter = originalEnter!
    }
  })

  it('changes at once under reduced motion', async () => {
    mocks.reduced = true
    const tree = await renderStage(0)
    await TestRenderer.act(() => { tree.update(<OnboardingStepStage step={1}>body</OnboardingStepStage>) })
    expect(timing).not.toHaveBeenCalled()
  })
})
