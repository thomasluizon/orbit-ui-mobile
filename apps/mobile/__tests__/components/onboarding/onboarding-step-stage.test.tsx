import React from 'react'
import { StyleSheet } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { motionDurations, motionEasings, motionLayerTiming } from '@orbit/shared/theme'
import { OnboardingStepStage } from '@/components/onboarding/onboarding-step-stage'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({ reduced: false }))
const motion = vi.hoisted(() => ({ bezier: [] as unknown[], timings: [] as { toValue: unknown; config: unknown }[], values: [] as { value: unknown }[], updaters: [] as (() => unknown)[] }))
vi.mock('@/lib/motion', () => ({
  toAnimatedEasing: () => undefined,
  usePrefersReducedMotion: () => mocks.reduced,
}))
vi.mock('react-native-reanimated', async () => {
  const base = await import('@/test-mocks/react-native-reanimated')
  const { useState } = await import('react')
  return {
    ...base,
    Easing: { ...base.Easing, bezier: (...points: number[]) => { motion.bezier.push(points); return base.Easing.linear } },
    useSharedValue: (initial: unknown) => useState(() => { const shared = { value: initial }; motion.values.push(shared); return shared })[0],
    useAnimatedStyle: (updater: () => unknown) => { motion.updaters.push(updater); return useState(updater)[0] },
    withTiming: (toValue: unknown, config: unknown) => { motion.timings.push({ toValue, config }); return { pendingTimingTo: toValue } },
  }
})

async function renderStage(step: number) {
  let tree!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => {
    tree = TestRenderer.create(<OnboardingStepStage step={step}>body</OnboardingStepStage>)
  })
  return tree
}

async function showStep(tree: ReturnType<typeof TestRenderer.create>, step: number) {
  await TestRenderer.act(() => { tree.update(<OnboardingStepStage step={step}>body</OnboardingStepStage>) })
}

function progressValue() {
  return motion.values[0]!
}

function styleWorkletAtProgress(progress: number, worklet = motion.updaters.at(-1)!) {
  progressValue().value = progress
  return worklet()
}

function committedStyle(tree: ReturnType<typeof TestRenderer.create>) {
  const stage = tree.root.findAll((node) => (node.type as unknown) === 'AnimatedView')[0]!
  return StyleSheet.flatten(stage.props.style) as { opacity?: unknown; transform?: { translateY?: unknown }[] }
}

describe('OnboardingStepStage', () => {
  beforeEach(() => {
    mocks.reduced = false
    motion.bezier = []
    motion.timings = []
    motion.values = []
    motion.updaters = []
  })

  it('leaves the step that opens the flow still', async () => {
    await renderStage(0)
    expect(motion.timings).toEqual([])
    expect(progressValue().value).toBe(1)
  })

  it('enters a changed step with the base duration, the enter easing and a rise by the shared shift', async () => {
    const tree = await renderStage(0)
    await showStep(tree, 1)
    expect(motion.timings).toEqual([{ toValue: 1, config: expect.objectContaining({ duration: motionDurations.base }) }])
    expect(motion.bezier).toEqual([[...motionEasings.enter]])
    expect(styleWorkletAtProgress(0)).toEqual({ opacity: 0, transform: [{ translateY: motionLayerTiming.routeShift }] })
    expect(styleWorkletAtProgress(1)).toEqual({ opacity: 1, transform: [{ translateY: 0 }] })
  })

  it('takes the shift, the duration and the curve from the shared tokens', async () => {
    const durations = motionDurations as unknown as Record<string, number>
    const easings = motionEasings as unknown as Record<string, readonly number[]>
    const layerTiming = motionLayerTiming as unknown as Record<string, number>
    const originalBase = durations.base
    const originalEnter = easings.enter
    const originalShift = layerTiming.routeShift
    durations.base = 333
    easings.enter = [0.1, 0.2, 0.3, 0.4]
    layerTiming.routeShift = 37
    try {
      const tree = await renderStage(0)
      await showStep(tree, 1)
      expect(motion.timings).toEqual([{ toValue: 1, config: expect.objectContaining({ duration: 333 }) }])
      expect(motion.bezier).toEqual([[0.1, 0.2, 0.3, 0.4]])
      expect(styleWorkletAtProgress(0)).toEqual({ opacity: 0, transform: [{ translateY: 37 }] })
      expect(styleWorkletAtProgress(0.5)).toEqual({ opacity: 0.5, transform: [{ translateY: 18.5 }] })
    } finally {
      durations.base = originalBase!
      easings.enter = originalEnter!
      layerTiming.routeShift = originalShift!
    }
  })

  it('draws the first frame of the new step risen by the shared shift with the worklet the UI thread holds from the previous render', async () => {
    const tree = await renderStage(0)
    const heldFromFirstStep = motion.updaters.at(-1)!
    await showStep(tree, 1)
    expect(styleWorkletAtProgress(0, heldFromFirstStep)).toEqual({ opacity: 0, transform: [{ translateY: motionLayerTiming.routeShift }] })
  })

  it('commits the new step at full opacity and no shift on every render during the fade, so no React commit carries a copy the fade left at 0', async () => {
    expect(motionLayerTiming.routeShift).not.toBe(0)
    const tree = await renderStage(0)
    await showStep(tree, 1)
    await showStep(tree, 1)
    const style = committedStyle(tree)
    expect(style.opacity).toBe(1)
    expect(style.transform?.[0]?.translateY).toBeCloseTo(0)
  })

  it('shows the step at once when the motion preference changes during its fade', async () => {
    const tree = await renderStage(0)
    await showStep(tree, 1)
    const fading = progressValue()
    expect(fading.value).toEqual({ pendingTimingTo: 1 })
    mocks.reduced = true
    await showStep(tree, 1)
    expect(fading.value).toBe(1)
  })

  it('changes at once under reduced motion', async () => {
    mocks.reduced = true
    const tree = await renderStage(0)
    await showStep(tree, 1)
    expect(motion.timings).toEqual([])
    expect(progressValue().value).toBe(1)
  })
})
