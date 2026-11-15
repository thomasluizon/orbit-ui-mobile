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
    const closeFirst = pauseOrbitLoopForOverlay(Symbol('first'))
    const closeSecond = pauseOrbitLoopForOverlay(Symbol('second'))
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
    const sheet = Symbol('sheet')
    const releasePage = claimOrbitLiveSlot(page)
    const closeSheet = pauseOrbitLoopForOverlay(sheet)
    const releaseInSheet = claimOrbitLiveSlot(inSheet, sheet)
    expect(mayOrbitRunLoop(page)).toBe(false)
    expect(mayOrbitRunLoop(inSheet)).toBe(true)
    const closeSecondSheet = pauseOrbitLoopForOverlay(Symbol('second-sheet'))
    expect(mayOrbitRunLoop(inSheet)).toBe(false)
    closeSecondSheet()
    releaseInSheet()
    closeSheet()
    expect(mayOrbitRunLoop(page)).toBe(true)
    releasePage()
  })

  it('runs only the Orbit in the overlay opened last when two overlays sit side by side', () => {
    const page = Symbol('page')
    const first = Symbol('first')
    const second = Symbol('second')
    const firstSheet = Symbol('first-sheet')
    const secondSheet = Symbol('second-sheet')
    const releasePage = claimOrbitLiveSlot(page)
    const closeFirst = pauseOrbitLoopForOverlay(firstSheet)
    const releaseFirst = claimOrbitLiveSlot(first, firstSheet)
    const closeSecond = pauseOrbitLoopForOverlay(secondSheet)
    const releaseSecond = claimOrbitLiveSlot(second, secondSheet)
    expect([mayOrbitRunLoop(page), mayOrbitRunLoop(first), mayOrbitRunLoop(second)]).toEqual([false, false, true])
    releaseSecond()
    closeSecond()
    expect([mayOrbitRunLoop(page), mayOrbitRunLoop(first)]).toEqual([false, true])
    releaseFirst()
    closeFirst()
    releasePage()
  })

  it('keeps the top overlay Orbit running when an overlay under it closes out of order', () => {
    const inFirst = Symbol('in-first')
    const inNested = Symbol('in-nested')
    const inSibling = Symbol('in-sibling')
    const first = Symbol('first')
    const nested = Symbol('nested')
    const sibling = Symbol('sibling')
    const closeFirst = pauseOrbitLoopForOverlay(first)
    const releaseInFirst = claimOrbitLiveSlot(inFirst, first)
    const closeNested = pauseOrbitLoopForOverlay(nested)
    const releaseInNested = claimOrbitLiveSlot(inNested, nested)
    const closeSibling = pauseOrbitLoopForOverlay(sibling)
    const releaseInSibling = claimOrbitLiveSlot(inSibling, sibling)
    expect([mayOrbitRunLoop(inFirst), mayOrbitRunLoop(inNested), mayOrbitRunLoop(inSibling)]).toEqual([false, false, true])
    releaseInNested()
    closeNested()
    expect([mayOrbitRunLoop(inFirst), mayOrbitRunLoop(inSibling)]).toEqual([false, true])
    releaseInSibling()
    closeSibling()
    expect(mayOrbitRunLoop(inFirst)).toBe(true)
    releaseInFirst()
    closeFirst()
  })

  it('keeps an overlay under the overlay inside it when the inner one registers first in the same commit', () => {
    const outer = Symbol('outer')
    const inner = Symbol('inner')
    const inOuter = Symbol('in-outer')
    const inInner = Symbol('in-inner')
    const closeInner = pauseOrbitLoopForOverlay(inner, outer)
    const closeOuter = pauseOrbitLoopForOverlay(outer)
    const releaseInOuter = claimOrbitLiveSlot(inOuter, outer)
    const releaseInInner = claimOrbitLiveSlot(inInner, inner)
    expect([mayOrbitRunLoop(inOuter), mayOrbitRunLoop(inInner)]).toEqual([false, true])
    const sibling = Symbol('sibling')
    const inSibling = Symbol('in-sibling')
    const closeSibling = pauseOrbitLoopForOverlay(sibling)
    const releaseInSibling = claimOrbitLiveSlot(inSibling, sibling)
    expect([mayOrbitRunLoop(inOuter), mayOrbitRunLoop(inInner), mayOrbitRunLoop(inSibling)]).toEqual([false, false, true])
    releaseInSibling()
    closeSibling()
    releaseInInner()
    closeInner()
    expect(mayOrbitRunLoop(inOuter)).toBe(true)
    releaseInOuter()
    closeOuter()
  })

  it('lets the conversation entry lead its view even when it claims after another Orbit', () => {
    const emptyState = Symbol('empty-state')
    const entry = Symbol('entry')
    const releaseEmptyState = claimOrbitLiveSlot(emptyState)
    const releaseEntry = claimOrbitLiveSlot(entry, null, true)
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
