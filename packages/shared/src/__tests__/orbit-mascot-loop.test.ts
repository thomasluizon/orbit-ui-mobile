import { afterEach, describe, expect, it } from 'vitest'
import {
  claimOrbitLiveSlot,
  getOrbitLoopVersion,
  mayOrbitRunLoop,
  pauseOrbitLoopForOverlay,
  setOrbitMotionEnabled,
  subscribeOrbitLoop,
} from '../utils/orbit-mascot-loop'

afterEach(() => setOrbitMotionEnabled(undefined))

describe('Orbit idle loop permission', () => {
  it('lets only the first live mascot run the loop', () => {
    const first = Symbol('first')
    const second = Symbol('second')
    const releaseFirst = claimOrbitLiveSlot(first)
    const releaseSecond = claimOrbitLiveSlot(second)
    expect(mayOrbitRunLoop(first)).toBe(true)
    expect(mayOrbitRunLoop(second)).toBe(false)
    releaseFirst()
    expect(mayOrbitRunLoop(second)).toBe(true)
    releaseSecond()
  })

  it('stops every loop when the person turns Orbit em movimento off, and an absent value means on', () => {
    const claim = Symbol('claim')
    const release = claimOrbitLiveSlot(claim)
    setOrbitMotionEnabled(false)
    expect(mayOrbitRunLoop(claim)).toBe(false)
    setOrbitMotionEnabled(undefined)
    expect(mayOrbitRunLoop(claim)).toBe(true)
    release()
  })

  it('pauses while an overlay covers the view and resumes after the last overlay closes', () => {
    const claim = Symbol('claim')
    const release = claimOrbitLiveSlot(claim)
    const closeFirst = pauseOrbitLoopForOverlay()
    const closeSecond = pauseOrbitLoopForOverlay()
    expect(mayOrbitRunLoop(claim)).toBe(false)
    closeFirst()
    closeFirst()
    expect(mayOrbitRunLoop(claim)).toBe(false)
    closeSecond()
    expect(mayOrbitRunLoop(claim)).toBe(true)
    release()
  })

  it('notifies subscribers and changes its version on each change', () => {
    let calls = 0
    const stop = subscribeOrbitLoop(() => { calls += 1 })
    const before = getOrbitLoopVersion()
    setOrbitMotionEnabled(false)
    expect(calls).toBe(1)
    expect(getOrbitLoopVersion()).toBeGreaterThan(before)
    stop()
    setOrbitMotionEnabled(true)
    expect(calls).toBe(1)
  })
})
