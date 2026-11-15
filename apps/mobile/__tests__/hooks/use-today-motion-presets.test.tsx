import React from 'react'
import { Animated } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { motionPresets, resolveMotionPreset, type MotionScenario } from '@orbit/shared/theme'
import { useTodayMotion } from '@/app/(tabs)/use-today-motion'
import { resolveBulkActionBarEnterShift } from '@/app/(tabs)/today-model'
import { useUIStore } from '@/stores/ui-store'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { calendarSlideMotion, getOrbitPageTurns } from '@orbit/shared/utils'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/lib/motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/motion')>()
  return { ...actual, useResolvedMotionPreset: (scenario: MotionScenario) => React.useMemo(() => resolveMotionPreset(scenario, motion.reduced), [scenario]) }
})

type Motion = ReturnType<typeof useTodayMotion>

async function renderTray(initialDay = '2026-11-13') {
  let latest!: Motion
  function Harness({ day }: Readonly<{ day: string }>) { latest = useTodayMotion({ filterMotionKey: day }); return null }
  let tree!: import('react-test-renderer').ReactTestRenderer
  await TestRenderer.act(() => { tree = TestRenderer.create(<Harness day={initialDay} />) })
  return {
    get latest() { return latest },
    day: (day: string) => TestRenderer.act(() => { tree.update(<Harness day={day} />) }),
    select: (isSelectMode: boolean) => TestRenderer.act(() => { useUIStore.setState({ isSelectMode }) }),
    unmount: () => TestRenderer.act(() => { tree.unmount() }),
  }
}

const opacityOf = (result: Motion) => (result.bulkBarAnimatedStyle.opacity as unknown as { value: number }).value
/** The test double of an interpolation answers the start of its output range. */
const startOf = (result: Motion) => {
  const [shift, scale] = result.bulkBarAnimatedStyle.transform as unknown as [{ translateY: number }, { scale: number }]
  return { shift: shift.translateY, scale: scale.scale }
}

beforeEach(() => { motion.reduced = false; useUIStore.setState({ isSelectMode: false }) })
afterEach(() => { vi.restoreAllMocks() })

describe('the Android selection tray uses the selection preset', () => {
  it('enters and leaves on the selection timings, from its shift and scale', async () => {
    const timing = vi.spyOn(Animated, 'timing')
    const tray = await renderTray()
    await tray.select(true)
    expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 1, duration: motionPresets.selection.enterDuration }))
    expect(startOf(tray.latest)).toEqual({ shift: resolveBulkActionBarEnterShift(resolveMotionPreset('selection')), scale: motionPresets.selection.scaleFrom })
    expect(startOf(tray.latest).shift).not.toBe(0)
    await tray.select(false)
    expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 0, duration: motionPresets.selection.exitDuration }))
    await tray.unmount()
  })

  it('shows the tray still under reduced motion: no shift, no scale, at full opacity at once', async () => {
    motion.reduced = true
    const timing = vi.spyOn(Animated, 'timing')
    const tray = await renderTray()
    await tray.select(true)
    expect(opacityOf(tray.latest)).toBe(1)
    expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 1, duration: motionPresets.selection.reducedMotion.enterDuration }))
    expect(startOf(tray.latest)).toEqual({ shift: 0, scale: 1 })
    await tray.unmount()
  })
})

describe('the Android day slide of Hoje under reduced motion', () => {
  it('shows the new day at once: no slide, full opacity, no timing and no ring turn', async () => {
    enableTestFlags('orbit_guided_flows')
    motion.reduced = true
    const timing = vi.spyOn(Animated, 'timing')
    const turns = getOrbitPageTurns()
    const today = await renderTray('2026-11-13')
    await today.day('2026-11-14')
    const [slide] = today.latest.dayAnimatedStyle.transform as unknown as [{ translateX: { value: number } }]
    expect(slide.translateX.value).toBe(0)
    expect((today.latest.dayAnimatedStyle.opacity as unknown as { value: number }).value).toBe(1)
    expect(timing).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ duration: calendarSlideMotion.duration }))
    expect(getOrbitPageTurns()).toBe(turns)
    await today.unmount()
  })
})
