import { createElement, useEffect, useState } from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUseConversationCrossfadeSnapshot } from '../hooks'
import { motionDurations } from '../theme/motion'

const useConversationCrossfadeSnapshot = createUseConversationCrossfadeSnapshot({ useState, useEffect })
const unmounts: (() => void)[] = []

function mountSnapshot(changeKey: string, children: string, durationMs: number = motionDurations.micro) {
  let snapshot!: { key: string; previous: string | null }
  function SnapshotProbe(props: { changeKey: string; children: string; durationMs: number }) {
    snapshot = useConversationCrossfadeSnapshot(props.changeKey, props.children, props.durationMs)
    return null
  }
  let tree!: ReturnType<typeof create>
  void act(() => { tree = create(createElement(SnapshotProbe, { changeKey, children, durationMs })) })
  const unmount = () => { void act(() => tree.unmount()) }
  unmounts.push(unmount)
  return {
    get current() { return snapshot },
    update: (nextKey: string, nextChildren: string, nextDurationMs = durationMs) => {
      void act(() => tree.update(createElement(SnapshotProbe, { changeKey: nextKey, children: nextChildren, durationMs: nextDurationMs })))
    },
    unmount,
  }
}

describe('shared conversation crossfade snapshot', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  })
  afterEach(() => {
    unmounts.splice(0).forEach(unmount => unmount())
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('keeps the previous children until the change duration ends', () => {
    const snapshot = mountSnapshot('first', 'Original result')
    expect(snapshot.current).toEqual({ key: 'first', previous: null })
    expect(vi.getTimerCount()).toBe(0)
    snapshot.update('second', 'Refreshed result')
    expect(snapshot.current).toEqual({ key: 'second', previous: 'Original result' })
    void act(() => { vi.advanceTimersByTime(motionDurations.micro - 1) })
    expect(snapshot.current.previous).toBe('Original result')
    void act(() => { vi.advanceTimersByTime(1) })
    expect(snapshot.current).toEqual({ key: 'second', previous: null })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('refreshes children without a key change for the next departing snapshot', () => {
    const snapshot = mountSnapshot('first', 'Partial result')
    snapshot.update('first', 'Complete result')
    expect(snapshot.current.previous).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    snapshot.update('second', 'New result')
    expect(snapshot.current.previous).toBe('Complete result')
  })

  it('does not restart the outgoing fade when the current children refresh', () => {
    const snapshot = mountSnapshot('first', 'Original result')
    snapshot.update('second', 'Partial result')
    void act(() => { vi.advanceTimersByTime(motionDurations.micro / 2) })
    snapshot.update('second', 'Complete result')
    expect(snapshot.current.previous).toBe('Original result')
    void act(() => { vi.advanceTimersByTime(motionDurations.micro / 2) })
    expect(snapshot.current.previous).toBeNull()
    snapshot.update('third', 'New result')
    expect(snapshot.current.previous).toBe('Complete result')
  })

  it('replaces the departing snapshot and cancels the earlier deadline on a new key', () => {
    const snapshot = mountSnapshot('first', 'First result')
    snapshot.update('second', 'Second result')
    void act(() => { vi.advanceTimersByTime(motionDurations.micro / 2) })
    snapshot.update('third', 'Third result')
    expect(snapshot.current).toEqual({ key: 'third', previous: 'Second result' })
    expect(vi.getTimerCount()).toBe(1)
    void act(() => { vi.advanceTimersByTime(motionDurations.micro / 2) })
    expect(snapshot.current.previous).toBe('Second result')
    void act(() => { vi.advanceTimersByTime(motionDurations.micro / 2) })
    expect(snapshot.current.previous).toBeNull()
  })

  it('clears the departing snapshot timer on unmount', () => {
    const snapshot = mountSnapshot('first', 'Original result')
    snapshot.update('second', 'New result')
    expect(vi.getTimerCount()).toBe(1)
    snapshot.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps zero-duration updates immediate without a departing snapshot or timer', () => {
    const snapshot = mountSnapshot('first', 'Original result', 0)
    snapshot.update('second', 'New result')
    expect(snapshot.current).toEqual({ key: 'second', previous: null })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('settles an active fade immediately when reduced motion is enabled', () => {
    const snapshot = mountSnapshot('first', 'Original result')
    snapshot.update('second', 'New result')
    expect(vi.getTimerCount()).toBe(1)
    snapshot.update('second', 'New result', 0)
    expect(snapshot.current.previous).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    snapshot.update('second', 'New result', motionDurations.micro)
    expect(snapshot.current.previous).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})
