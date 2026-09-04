import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTodayMotion } from '@/app/(tabs)/use-today-motion'

const mocks = vi.hoisted(() => ({
  completeAnimations: true,
  parallel: vi.fn(),
  reducedMotion: false,
  timing: vi.fn(),
  timingCalls: [] as { from: number; to: number; duration: number }[],
  values: [] as { current: number }[],
}))

vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>()

  class MockValue {
    current: number

    constructor(initial: number) {
      this.current = initial
      mocks.values.push(this)
    }

    setValue(next: number) {
      this.current = next
    }

    interpolate() {
      return this
    }

    stopAnimation(callback?: (value: number) => void) {
      callback?.(this.current)
    }
  }

  return {
    ...actual,
    Animated: {
      Value: MockValue,
      parallel: mocks.parallel,
      timing: mocks.timing,
    },
  }
})

vi.mock('@/lib/motion', () => ({
  createAnimatedTimingConfig: (duration: number) => ({ duration, toValue: 1, useNativeDriver: true }),
  toAnimatedEasing: () => 'ease-out',
  useResolvedMotionPreset: () => ({
    enterDuration: 220,
    enterEasing: 'enter',
    exitDuration: 160,
    exitEasing: 'exit',
    reducedMotionEnabled: mocks.reducedMotion,
    scaleFrom: 0.95,
  }),
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: { isSelectMode: boolean }) => unknown) => selector({ isSelectMode: false }),
}))

vi.mock('@/app/(tabs)/today-model', () => ({
  resolveBulkActionBarEnterShift: () => 16,
}))

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function MotionHarness({ date }: Readonly<{ date: string }>) {
  useTodayMotion({ filterMotionKey: date, isRefetching: false })
  return null
}

describe('Today day motion', () => {
  beforeEach(() => {
    mocks.completeAnimations = true
    mocks.reducedMotion = false
    mocks.timing.mockClear()
    mocks.timingCalls.length = 0
    mocks.values.length = 0
    mocks.timing.mockImplementation((value: { current: number }, config: { toValue: number; duration: number }) => {
      mocks.timingCalls.push({ from: value.current, to: config.toValue, duration: config.duration })
      return {
        start: () => {
          if (mocks.completeAnimations) value.current = config.toValue
        },
      }
    })
    mocks.parallel.mockImplementation((animations: { start: () => void }[]) => ({
      start: () => animations.forEach((animation) => animation.start()),
    }))
  })

  it('uses signed eight pixel entrances for forward and backward days', async () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<MotionHarness date="2026-09-03" />)
    })
    mocks.timingCalls.length = 0

    await TestRenderer.act(() => {
      tree.update(<MotionHarness date="2026-09-04" />)
    })
    expect(mocks.timingCalls).toEqual([
      { from: 8, to: 0, duration: 220 },
      { from: 0.9, to: 1, duration: 220 },
    ])

    mocks.timingCalls.length = 0
    await TestRenderer.act(() => {
      tree.update(<MotionHarness date="2026-09-02" />)
    })
    expect(mocks.timingCalls).toEqual([
      { from: -8, to: 0, duration: 220 },
      { from: 0.9, to: 1, duration: 220 },
    ])
  })

  it('settles an active transition when reduced motion is enabled without changing the date', async () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<MotionHarness date="2026-09-03" />)
    })
    mocks.completeAnimations = false

    await TestRenderer.act(() => {
      tree.update(<MotionHarness date="2026-09-04" />)
    })
    expect(mocks.values.slice(0, 2).map((value) => value.current)).toEqual([0.9, 8])

    mocks.reducedMotion = true
    mocks.timing.mockClear()
    await TestRenderer.act(() => {
      tree.update(<MotionHarness date="2026-09-04" />)
    })

    expect(mocks.timing).not.toHaveBeenCalled()
    expect(mocks.values.slice(0, 2).map((value) => value.current)).toEqual([1, 0])
  })
})
