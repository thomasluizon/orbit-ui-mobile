import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { Animated, View } from 'react-native'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { useOverlayMotion } from '@/lib/overlay-motion'

const preference = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/lib/motion', async (original) => ({
  ...await original<typeof import('@/lib/motion')>(),
  useResolvedMotionPreset: (scenario: Parameters<typeof resolveMotionPreset>[0]) => resolveMotionPreset(scenario, preference.reduced),
}))

let tree: ReactTestRenderer
function presentation() { return tree.root.findAll((node) => node.props.testID === 'presentation') }
function Probe({ open }: Readonly<{ open: boolean }>) {
  const motion = useOverlayMotion(open, 'toast')
  return motion.present ? <View testID="presentation" style={motion.style} pointerEvents={open ? 'auto' : 'none'} /> : null
}

beforeEach(() => { vi.useFakeTimers(); preference.reduced = false })
afterEach(async () => { await act(() => tree.update(<></>)); vi.useRealTimers(); vi.restoreAllMocks() })

it('releases interaction immediately and retains only the bounded visual exit', async () => {
  const timing = vi.spyOn(Animated, 'timing')
  await act(() => { tree = create(<Probe open />) })
  expect(timing).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ toValue: 1, duration: 220, useNativeDriver: true }))
  await act(() => tree.update(<Probe open={false} />))
  expect(presentation()[0]!.props.pointerEvents).toBe('none')
  await act(() => { vi.advanceTimersByTime(159) })
  expect(presentation()).not.toHaveLength(0)
  await act(() => { vi.advanceTimersByTime(1) })
  expect(presentation()).toHaveLength(0)
})

it('cancels a pending exit when reopened and settles a live reduced motion change', async () => {
  const timing = vi.spyOn(Animated, 'timing')
  await act(() => { tree = create(<Probe open />) })
  await act(() => tree.update(<Probe open={false} />))
  await act(() => { vi.advanceTimersByTime(80) })
  await act(() => tree.update(<Probe open />))
  await act(() => { vi.advanceTimersByTime(200) })
  expect(presentation()[0]!.props.pointerEvents).toBe('auto')
  preference.reduced = true
  await act(() => tree.update(<Probe open />))
  expect(timing).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ toValue: 1, duration: 0 }))
  expect(presentation()[0]!.props.style).toMatchObject({ transform: [] })
  await act(() => tree.update(<Probe open={false} />))
  await act(() => { vi.advanceTimersByTime(0) })
  expect(presentation()).toHaveLength(0)
})
