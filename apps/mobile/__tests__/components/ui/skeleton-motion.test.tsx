import React from 'react'
import { Animated } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Skeleton } from '@/components/ui/skeleton'

const TestRenderer = require('react-test-renderer')
const motionPreference = vi.hoisted(() => ({ reduced: false }))

vi.mock('@/lib/motion', () => ({
  usePrefersReducedMotion: () => motionPreference.reduced,
}))

describe('mobile skeleton motion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    motionPreference.reduced = false
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('settles a stalled skeleton after four pulses and cleans up on unmount', () => {
    const stop = vi.fn()
    const setValue = vi.spyOn(Animated.Value.prototype, 'setValue')
    const loop = vi.spyOn(Animated, 'loop').mockImplementation((_animation, config) => ({
      start: (callback) => {
        if (config?.iterations !== undefined) {
          setTimeout(() => callback?.({ finished: true }), config.iterations * 1_100)
        }
      },
      stop,
      reset: vi.fn(),
      _startNativeLoop: vi.fn(),
      _isUsingNativeDriver: () => true,
    }))
    let tree!: ReturnType<typeof TestRenderer.create>

    TestRenderer.act(() => {
      tree = TestRenderer.create(<Skeleton variant="habit-row" label="Loading habits" />)
    })
    TestRenderer.act(() => vi.advanceTimersByTime(5_000))

    expect(loop).toHaveBeenCalledWith(expect.anything(), { iterations: 4 })
    expect(setValue).toHaveBeenCalledWith(1)
    expect(tree.root.findByProps({ testID: 'skeleton-unit-habit-row' })).toBeTruthy()

    TestRenderer.act(() => tree.unmount())
    expect(stop).toHaveBeenCalledOnce()
  })

  it('settles immediately without starting a loop under reduced motion', () => {
    motionPreference.reduced = true
    const loop = vi.spyOn(Animated, 'loop')
    const setValue = vi.spyOn(Animated.Value.prototype, 'setValue')

    TestRenderer.act(() => {
      TestRenderer.create(<Skeleton variant="stat-tile" label="Loading stats" />)
    })

    expect(loop).not.toHaveBeenCalled()
    expect(setValue).toHaveBeenCalledWith(1)
  })
})
