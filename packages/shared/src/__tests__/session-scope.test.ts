import { describe, expect, it, vi } from 'vitest'

import { createSessionCounter, createSessionScopedRunner } from '../utils/session-scope'

describe('createSessionScopedRunner', () => {
  it('runs the operation and returns its result while the session still owns it', () => {
    const runForSession = createSessionScopedRunner(() => 4)
    const operation = vi.fn(() => 'restored')

    expect(runForSession(4, operation)).toBe('restored')
    expect(operation).toHaveBeenCalledTimes(1)
  })

  it('skips the operation once another account owns the session', () => {
    const runForSession = createSessionScopedRunner(() => 5)
    const operation = vi.fn(() => 'restored')

    expect(runForSession(4, operation)).toBeUndefined()
    expect(operation).not.toHaveBeenCalled()
  })

  it('reads the session again on every call, so a callback queued earlier still gets blocked', () => {
    let currentEpoch = 4
    const runForSession = createSessionScopedRunner(() => currentEpoch)
    const operation = vi.fn(() => 'restored')

    expect(runForSession(4, operation)).toBe('restored')

    currentEpoch = 5

    expect(runForSession(4, operation)).toBeUndefined()
    expect(operation).toHaveBeenCalledTimes(1)
  })
})

describe('createSessionCounter', () => {
  it('starts at zero and reads one step higher after every advance', () => {
    const counter = createSessionCounter()

    expect(counter.read()).toBe(0)

    counter.advance()

    expect(counter.read()).toBe(1)

    counter.advance()

    expect(counter.read()).toBe(2)
  })

  it('notifies every subscriber on a single advance', () => {
    const counter = createSessionCounter()
    const firstListener = vi.fn()
    const secondListener = vi.fn()

    counter.subscribe(firstListener)
    counter.subscribe(secondListener)
    counter.advance()

    expect(firstListener).toHaveBeenCalledTimes(1)
    expect(secondListener).toHaveBeenCalledTimes(1)
  })

  it('stops notifying a listener that unsubscribes, and keeps notifying the rest', () => {
    const counter = createSessionCounter()
    const retiredListener = vi.fn()
    const keptListener = vi.fn()

    const unsubscribe = counter.subscribe(retiredListener)
    counter.subscribe(keptListener)
    unsubscribe()
    counter.advance()

    expect(retiredListener).not.toHaveBeenCalled()
    expect(keptListener).toHaveBeenCalledTimes(1)
  })

  it('finishes the pass when a listener unsubscribes itself from inside its own callback', () => {
    const counter = createSessionCounter()
    const laterListener = vi.fn()
    const selfRetiringListener = vi.fn(() => {
      unsubscribeSelf()
    })

    const unsubscribeSelf = counter.subscribe(selfRetiringListener)
    counter.subscribe(laterListener)
    counter.advance()

    expect(selfRetiringListener).toHaveBeenCalledTimes(1)
    expect(laterListener).toHaveBeenCalledTimes(1)

    counter.advance()

    expect(selfRetiringListener).toHaveBeenCalledTimes(1)
    expect(laterListener).toHaveBeenCalledTimes(2)
  })

  it('finishes the pass on a listener another callback unsubscribed midway through it', () => {
    const counter = createSessionCounter()
    const laterListener = vi.fn()
    const retiringListener = vi.fn(() => {
      unsubscribeLater()
    })

    counter.subscribe(retiringListener)
    const unsubscribeLater = counter.subscribe(laterListener)
    counter.advance()

    expect(retiringListener).toHaveBeenCalledTimes(1)
    expect(laterListener).toHaveBeenCalledTimes(1)

    counter.advance()

    expect(retiringListener).toHaveBeenCalledTimes(2)
    expect(laterListener).toHaveBeenCalledTimes(1)
  })
})
