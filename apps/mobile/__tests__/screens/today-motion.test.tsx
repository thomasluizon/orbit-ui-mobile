import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTodayDayMotion } from '@/app/(tabs)/use-today-motion'

const mocks = vi.hoisted(() => ({
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
  toAnimatedEasing: () => 'ease-out',
  useResolvedMotionPreset: () => ({
    enterDuration: 220,
    enterEasing: [0.16, 1, 0.3, 1],
    reducedMotionEnabled: mocks.reducedMotion,
  }),
}))

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')

function MotionHarness({ date }: Readonly<{ date: string }>) {
  useTodayDayMotion(date)
  return null
}

describe('Today day motion', () => {
  beforeEach(() => {
    mocks.reducedMotion = false
    mocks.timing.mockClear()
    mocks.timingCalls.length = 0
    mocks.values.length = 0
    mocks.timing.mockImplementation((value: { current: number }, config: { toValue: number; duration: number }) => {
      mocks.timingCalls.push({ from: value.current, to: config.toValue, duration: config.duration })
      return {
        start: () => {
          value.current = config.toValue
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

  it('settles without timing when reduced motion is active', async () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<MotionHarness date="2026-09-03" />)
    })
    mocks.reducedMotion = true

    await TestRenderer.act(() => {
      tree.update(<MotionHarness date="2026-09-04" />)
    })

    expect(mocks.timing).not.toHaveBeenCalled()
    expect(mocks.values.map((value) => value.current)).toEqual([1, 0])
  })
})
