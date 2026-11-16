import React from 'react'
import { StyleSheet } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginStepStage } from '@/components/auth/login-sections'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({ reduced: false, enterDuration: 300, shift: 20, enterEasing: [0.1, 0.2, 0.3, 0.4] }))
const motion = vi.hoisted(() => ({ bezier: [] as unknown[], timings: [] as { toValue: unknown; config: unknown }[], values: [] as { value: unknown }[], updaters: [] as (() => unknown)[] }))
vi.mock('@/lib/motion', async () => {
  const shared = await import('@orbit/shared/theme')
  return {
    useResolvedMotionPreset: () => ({ ...shared.resolveMotionPreset('route-replace', mocks.reduced), enterDuration: mocks.enterDuration, enterEasing: mocks.enterEasing, shift: mocks.shift }),
  }
})
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

async function renderStep(step: string) {
  let tree!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => { tree = TestRenderer.create(<LoginStepStage step={step}>body</LoginStepStage>) })
  return tree
}

async function showStep(tree: ReturnType<typeof TestRenderer.create>, step: string) {
  await TestRenderer.act(() => { tree.update(<LoginStepStage step={step}>body</LoginStepStage>) })
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
  return StyleSheet.flatten(stage.props.style) as { opacity?: unknown; transform?: { translateX?: unknown }[] }
}

describe('LoginStepStage motion', () => {
  beforeEach(() => {
    mocks.reduced = false
    motion.bezier = []
    motion.timings = []
    motion.values = []
    motion.updaters = []
  })

  it('takes the duration and easing from the shared preset', async () => {
    const tree = await renderStep('email')
    await showStep(tree, 'code')
    expect(motion.timings).toEqual([{ toValue: 1, config: expect.objectContaining({ duration: 300 }) }])
    expect(motion.bezier).toEqual([mocks.enterEasing])
  })

  it('slides the code step in from the right and the e-mail step in from the left by the preset shift, as on web', async () => {
    const tree = await renderStep('email')
    await showStep(tree, 'code')
    expect(styleWorkletAtProgress(0)).toEqual({ opacity: 0, transform: [{ translateX: 20 }] })
    expect(styleWorkletAtProgress(0.5)).toEqual({ opacity: 0.5, transform: [{ translateX: 10 }] })
    expect(styleWorkletAtProgress(1)).toEqual({ opacity: 1, transform: [{ translateX: 0 }] })
    await showStep(tree, 'email')
    expect(styleWorkletAtProgress(0)).toEqual({ opacity: 0, transform: [{ translateX: -20 }] })
  })

  it('draws the first frame of the new step from the right side with the worklet the UI thread holds from the previous render', async () => {
    const tree = await renderStep('email')
    const heldFromEmail = motion.updaters.at(-1)!
    await showStep(tree, 'code')
    expect(styleWorkletAtProgress(0, heldFromEmail)).toEqual({ opacity: 0, transform: [{ translateX: 20 }] })
    const heldFromCode = motion.updaters.at(-1)!
    await showStep(tree, 'email')
    expect(styleWorkletAtProgress(0, heldFromCode)).toEqual({ opacity: 0, transform: [{ translateX: -20 }] })
  })

  it('commits the new step at full opacity and no shift on every render during the fade, so no React commit carries a copy the fade left at 0', async () => {
    const tree = await renderStep('email')
    await showStep(tree, 'code')
    await showStep(tree, 'code')
    const style = committedStyle(tree)
    expect(style.opacity).toBe(1)
    expect(style.transform?.[0]?.translateX).toBeCloseTo(0)
  })

  it('shows the step at once when the motion preference changes during its fade', async () => {
    const tree = await renderStep('email')
    await showStep(tree, 'code')
    const fading = progressValue()
    expect(fading.value).toEqual({ pendingTimingTo: 1 })
    mocks.reduced = true
    await showStep(tree, 'code')
    expect(fading.value).toBe(1)
  })

  it('changes at once under reduced motion', async () => {
    mocks.reduced = true
    const tree = await renderStep('email')
    await showStep(tree, 'code')
    expect(motion.timings).toEqual([])
    expect(progressValue().value).toBe(1)
  })
})
