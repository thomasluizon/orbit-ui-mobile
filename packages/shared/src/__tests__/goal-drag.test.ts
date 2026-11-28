import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGoalDragGesture } from '../utils/goal-drag'

function startGesture(pointerType: string) {
  const onActivate = vi.fn<() => void>()
  return { gesture: createGoalDragGesture(pointerType, 100, 100, onActivate), onActivate }
}

describe('createGoalDragGesture', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts a touch drag after a 300ms hold and suppresses the press', () => {
    const { gesture, onActivate } = startGesture('touch')

    vi.advanceTimersByTime(299)
    expect([gesture.isActive(), gesture.suppressPress()]).toEqual([false, false])

    vi.advanceTimersByTime(1)
    gesture.move(100, 160)
    expect([gesture.isActive(), gesture.suppressPress()]).toEqual([true, true])
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('keeps the hold while a touch stays within 5px', () => {
    const { gesture, onActivate } = startGesture('touch')

    gesture.move(103, 104)
    vi.advanceTimersByTime(300)

    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('reads an early touch move as a scroll, with no drag and no press', () => {
    const { gesture, onActivate } = startGesture('touch')

    gesture.move(100, 106)
    vi.advanceTimersByTime(300)

    expect([gesture.isActive(), gesture.suppressPress()]).toEqual([false, true])
    expect(onActivate).not.toHaveBeenCalled()
  })

  it.each(['mouse', 'pen'])('starts a %s drag only after a move beyond 5px', (pointerType) => {
    const { gesture, onActivate } = startGesture(pointerType)

    vi.advanceTimersByTime(1000)
    gesture.move(103, 104)
    expect([gesture.isActive(), gesture.suppressPress()]).toEqual([false, false])

    gesture.move(106, 100)
    gesture.move(140, 100)
    expect([gesture.isActive(), gesture.suppressPress()]).toEqual([true, true])
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it.each(['touch', 'mouse'])('starts no drag after a cancelled %s gesture', (pointerType) => {
    const { gesture, onActivate } = startGesture(pointerType)

    gesture.cancel()
    gesture.move(140, 100)
    vi.advanceTimersByTime(300)

    expect([gesture.isActive(), gesture.suppressPress()]).toEqual([false, false])
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('ends an active drag on cancel and still suppresses its press', () => {
    const { gesture } = startGesture('mouse')

    gesture.move(140, 100)
    gesture.cancel()

    expect([gesture.isActive(), gesture.suppressPress()]).toEqual([false, true])
  })
})
