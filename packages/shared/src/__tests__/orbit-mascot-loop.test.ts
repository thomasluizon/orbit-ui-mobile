import { afterEach, describe, expect, it } from 'vitest'
import { conversationMascotState } from '../chat/composer-controls'
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

  it('lets the Orbit inside the top overlay run while the Orbit under it stays still', () => {
    const page = Symbol('page')
    const inSheet = Symbol('in-sheet')
    const releasePage = claimOrbitLiveSlot(page)
    const closeSheet = pauseOrbitLoopForOverlay()
    const releaseInSheet = claimOrbitLiveSlot(inSheet, 1)
    expect(mayOrbitRunLoop(page)).toBe(false)
    expect(mayOrbitRunLoop(inSheet)).toBe(true)
    const closeSecondSheet = pauseOrbitLoopForOverlay()
    expect(mayOrbitRunLoop(inSheet)).toBe(false)
    closeSecondSheet()
    releaseInSheet()
    closeSheet()
    expect(mayOrbitRunLoop(page)).toBe(true)
    releasePage()
  })

  it('lets the conversation entry lead its view even when it claims after another Orbit', () => {
    const emptyState = Symbol('empty-state')
    const entry = Symbol('entry')
    const releaseEmptyState = claimOrbitLiveSlot(emptyState)
    const releaseEntry = claimOrbitLiveSlot(entry, 0, true)
    expect(mayOrbitRunLoop(entry)).toBe(true)
    expect(mayOrbitRunLoop(emptyState)).toBe(false)
    releaseEntry()
    expect(mayOrbitRunLoop(emptyState)).toBe(true)
    releaseEmptyState()
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

describe('conversationMascotState', () => {
  it.each([
    [{ isOnline: true, atMessageLimit: false }, 'parado'],
    [{ isOnline: false, atMessageLimit: false }, 'descansando'],
    [{ isOnline: true, atMessageLimit: true }, 'descansando'],
    [{ isOnline: true, atMessageLimit: false, dailyBudgetReached: true }, 'descansando'],
  ] as const)('rests Orbit only while the AI is unavailable: %o', (state, expected) => {
    expect(conversationMascotState(state)).toBe(expected)
  })
})
