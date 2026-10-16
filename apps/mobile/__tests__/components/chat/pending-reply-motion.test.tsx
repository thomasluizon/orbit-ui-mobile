import React from 'react'
import * as Reanimated from 'react-native-reanimated'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { motionDurations, skeletonPulseIterations } from '@orbit/shared/theme'
import { PendingReply } from '@/components/chat/pending-reply'

vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => false }))

const pulseBudget = motionDurations.slow * 4 * skeletonPulseIterations
type PendingTree = ReturnType<typeof create> & { unmount(): void }
let tree: PendingTree | undefined
beforeEach(() => { vi.useFakeTimers() })
afterEach(() => {
  void act(() => tree?.unmount())
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('keeps exhausted pending dots static after scrolling away and back', () => {
  const repeat = vi.spyOn(Reanimated, 'withRepeat')
  void act(() => { tree = create(<PendingReply visible />) as PendingTree })
  void act(() => { vi.advanceTimersByTime(pulseBudget) })
  void act(() => tree!.update(<PendingReply visible={false} />))
  repeat.mockClear()
  void act(() => tree!.update(<PendingReply visible />))
  expect(repeat).not.toHaveBeenCalled()
  expect(tree!.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'astra-pending')).toHaveLength(1)
})

it('preserves the remaining pulse budget while the pending line is offscreen', () => {
  const repeat = vi.spyOn(Reanimated, 'withRepeat')
  const cancel = vi.spyOn(Reanimated, 'cancelAnimation')
  void act(() => { tree = create(<PendingReply visible />) as PendingTree })
  void act(() => { vi.advanceTimersByTime(pulseBudget - 100) })
  void act(() => tree!.update(<PendingReply visible={false} />))
  void act(() => { vi.advanceTimersByTime(10_000) })
  repeat.mockClear()
  void act(() => tree!.update(<PendingReply visible />))
  expect(repeat).toHaveBeenCalledOnce()
  cancel.mockClear()
  void act(() => { vi.advanceTimersByTime(100) })
  expect(cancel).toHaveBeenCalled()
  void act(() => tree!.update(<PendingReply visible={false} />))
  repeat.mockClear()
  void act(() => tree!.update(<PendingReply visible />))
  expect(repeat).not.toHaveBeenCalled()
})
