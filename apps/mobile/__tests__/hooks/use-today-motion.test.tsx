import React from 'react'
import { Animated } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTodayMotion } from '@/app/(tabs)/use-today-motion'
import { useUIStore } from '@/stores/ui-store'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type MotionResult = ReturnType<typeof useTodayMotion>
type InspectableAnimatedValue = Animated.Value & { value: number }

function animatedValue(value: unknown) {
  return value as InspectableAnimatedValue
}

async function renderMotion(initialDate: string) {
  let latest!: MotionResult

  function Harness({ date }: Readonly<{ date: string }>) {
    latest = useTodayMotion({ filterMotionKey: date, isRefetching: false })
    return null
  }

  let tree!: import('react-test-renderer').ReactTestRenderer
  await TestRenderer.act(() => {
    tree = TestRenderer.create(<Harness date={initialDate} />)
    return Promise.resolve()
  })

  return {
    get latest() {
      return latest
    },
    async update(date: string) {
      await TestRenderer.act(() => {
        tree.update(<Harness date={date} />)
        return Promise.resolve()
      })
    },
    async unmount() {
      await TestRenderer.act(() => {
        ;(tree as unknown as { unmount: () => void }).unmount()
        return Promise.resolve()
      })
    },
  }
}

function transitionValues(result: MotionResult) {
  const translateY = result.dayAnimatedStyle.transform[0]?.translateY
  if (!translateY) throw new Error('Today transition is missing translateY')
  return {
    opacity: animatedValue(result.dayAnimatedStyle.opacity),
    translateY: animatedValue(translateY),
  }
}

describe('useTodayMotion', () => {
  beforeEach(() => {
    useUIStore.setState({ isSelectMode: false })
  })

  it('enters the next day from 8px with the shared 220ms ease-out timing', async () => {
    const timing = vi.spyOn(Animated, 'timing')
    const motion = await renderMotion('2026-04-08')

    await motion.update('2026-04-09')

    const values = transitionValues(motion.latest)
    expect(values.opacity.value).toBe(0.9)
    expect(values.translateY.value).toBe(8)
    expect(timing).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ duration: 220, toValue: 1, useNativeDriver: true }),
    )
    expect(timing).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ duration: 220, toValue: 0, useNativeDriver: true }),
    )

    await motion.unmount()
    timing.mockRestore()
  })

  it('enters the previous day from negative 8px', async () => {
    const motion = await renderMotion('2026-04-08')

    await motion.update('2026-04-07')

    expect(transitionValues(motion.latest).translateY.value).toBe(-8)
    await motion.unmount()
  })

  it('retargets a rapid date change from the live transition values', async () => {
    const motion = await renderMotion('2026-04-08')
    await motion.update('2026-04-09')
    const values = transitionValues(motion.latest)
    values.opacity.setValue(0.95)
    values.translateY.setValue(3)

    await motion.update('2026-04-10')

    expect(values.opacity.value).toBe(0.95)
    expect(values.translateY.value).toBe(3)
    await motion.unmount()
  })

  it('keeps the bulk action tray mounted until its exit motion completes', async () => {
    const exitCompletions: ((result: { finished: boolean }) => void)[] = []
    const timing = vi.spyOn(Animated, 'timing').mockImplementation(() => ({
      start: (completion?: (result: { finished: boolean }) => void) => {
        if (completion) exitCompletions.push(completion)
      },
      stop: vi.fn(),
      reset: vi.fn(),
    }))
    const motion = await renderMotion('2026-04-08')

    await TestRenderer.act(async () => {
      useUIStore.setState({ isSelectMode: true })
      await Promise.resolve()
    })
    expect(motion.latest.renderBulkActionBar).toBe(true)

    exitCompletions.length = 0
    await TestRenderer.act(async () => {
      useUIStore.setState({ isSelectMode: false })
      await Promise.resolve()
    })
    expect(motion.latest.renderBulkActionBar).toBe(true)
    expect(exitCompletions).toHaveLength(1)

    await TestRenderer.act(async () => {
      exitCompletions[0]?.({ finished: true })
      await Promise.resolve()
    })
    expect(motion.latest.renderBulkActionBar).toBe(false)

    await motion.unmount()
    timing.mockRestore()
  })

  it('ignores a deferred enter callback after selection has started exiting', async () => {
    const enterCompletions: ((value: number) => void)[] = []
    const exitCompletions: ((result: { finished: boolean }) => void)[] = []
    const stopAnimation = vi.spyOn(Animated.Value.prototype, 'stopAnimation')
      .mockImplementation((completion?: (value: number) => void) => {
        if (completion) enterCompletions.push(completion)
      })
    const timing = vi.spyOn(Animated, 'timing').mockImplementation(() => ({
      start: (completion?: (result: { finished: boolean }) => void) => {
        if (completion) exitCompletions.push(completion)
      },
      stop: vi.fn(),
      reset: vi.fn(),
    }))
    const motion = await renderMotion('2026-04-08')

    await TestRenderer.act(async () => {
      useUIStore.setState({ isSelectMode: true })
      await Promise.resolve()
    })
    expect(enterCompletions).toHaveLength(1)

    await TestRenderer.act(async () => {
      useUIStore.setState({ isSelectMode: false })
      await Promise.resolve()
    })
    expect(motion.latest.renderBulkActionBar).toBe(true)
    const timingCallsBeforeStaleEnter = timing.mock.calls.length

    await TestRenderer.act(async () => {
      enterCompletions[0]?.(0)
      await Promise.resolve()
    })
    expect(timing).toHaveBeenCalledTimes(timingCallsBeforeStaleEnter)
    expect(motion.latest.renderBulkActionBar).toBe(true)

    await TestRenderer.act(async () => {
      exitCompletions.at(-1)?.({ finished: true })
      await Promise.resolve()
    })
    expect(motion.latest.renderBulkActionBar).toBe(false)

    await motion.unmount()
    timing.mockRestore()
    stopAnimation.mockRestore()
  })
})
