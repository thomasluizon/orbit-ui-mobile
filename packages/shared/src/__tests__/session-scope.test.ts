import { describe, expect, it, vi } from 'vitest'

import { createSessionScopedRunner } from '../utils/session-scope'

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
