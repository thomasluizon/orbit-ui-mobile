import { describe, expect, it, vi } from 'vitest'
import { isSafeAuthReturnUrl, LoginAttemptScope, readLoginEmailLink } from '../utils/login-attempt'

describe('email sign-in links', () => {
  it('accepts one complete valid link and ignores a duplicate delivery', () => {
    const link = readLoginEmailLink(' person@example.org ', '123456')
    expect(link).toEqual({ email: 'person@example.org', code: '123456' })
    expect(readLoginEmailLink('person@example.org', '123456', link)).toBeUndefined()
    expect(readLoginEmailLink('person@example.org', '654321', link)).toEqual({ email: 'person@example.org', code: '654321' })
    expect(readLoginEmailLink('other@example.org', '123456', link)).toEqual({ email: 'other@example.org', code: '123456' })
  })

  it('leaves ordinary manual entry alone when a link is absent or disabled', () => {
    expect(readLoginEmailLink(undefined, undefined)).toBeUndefined()
    expect(readLoginEmailLink('person@example.org', '123456', null, false)).toBeUndefined()
  })

  it.each([
    [undefined, '123456'],
    ['person@example.org', undefined],
    [null, '123456'],
    ['not-an-email', '123456'],
    [['person@example.org'], '123456'],
    ['person@example.org', ['123456']],
    ['person@example.org', '12345'],
    ['person@example.org', '1234567'],
    ['person@example.org', '12345a'],
  ])('rejects malformed credential parameters %#', (email, code) => {
    expect(readLoginEmailLink(email, code)).toBeNull()
  })
})

describe('sign-in return navigation', () => {
  it.each(['/', '/profile', '/habits/example?from=today#activity'])('retains a local destination %s', (path) => {
    expect(isSafeAuthReturnUrl(path)).toBe(true)
  })

  it.each([undefined, null, '', 'https://example.org', '//example.org', '/\\example.org', '/profile\n', '/profile\u0000', '/profile\u007f'])('rejects an unsafe destination %#', (path) => {
    expect(isSafeAuthReturnUrl(path)).toBe(false)
  })
})

describe('sign-in attempt ownership', () => {
  it('binds the captured email to its session and invalidates a replaced attempt', () => {
    const scope = new LoginAttemptScope()
    const attempt = scope.capture(' person@example.org ', 4)
    expect(attempt.email).toBe('person@example.org')
    expect(scope.owns(attempt, 4)).toBe(true)
    expect(scope.owns(attempt, 5)).toBe(false)
    scope.invalidate()
    expect(scope.owns(attempt, 4)).toBe(false)
    expect(scope.owns(scope.capture('other@example.org', 4), 4)).toBe(true)
  })

  it('cancels pending work once when the authenticated session changes', () => {
    const scope = new LoginAttemptScope()
    const cancel = vi.fn()
    const attempt = scope.capture('person@example.org', 4)
    scope.watch(attempt, cancel)
    scope.observeSession(4)
    expect(cancel).not.toHaveBeenCalled()
    scope.observeSession(5)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(scope.owns(attempt, 4)).toBe(false)
    scope.observeSession(6)
    scope.invalidate()
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('releases completed work without cancelling it on later navigation', () => {
    const scope = new LoginAttemptScope()
    const cancel = vi.fn()
    const attempt = scope.capture('person@example.org', 4)
    scope.watch(attempt, cancel)
    scope.release(attempt)
    scope.observeSession(5)
    scope.invalidate()
    expect(cancel).not.toHaveBeenCalled()
  })

  it('keeps a replacement pending when the retired attempt finishes late', () => {
    const scope = new LoginAttemptScope()
    const retiredCancel = vi.fn()
    const retired = scope.capture('person@example.org', 4)
    scope.watch(retired, retiredCancel)
    scope.invalidate()
    const replacementCancel = vi.fn()
    const replacement = scope.capture('other@example.org', 4)
    scope.watch(replacement, replacementCancel)
    scope.release(retired)
    expect(scope.owns(retired, 4)).toBe(false)
    expect(scope.owns(replacement, 4)).toBe(true)
    scope.invalidate()
    expect(retiredCancel).toHaveBeenCalledTimes(1)
    expect(replacementCancel).toHaveBeenCalledTimes(1)
    expect(scope.owns(replacement, 4)).toBe(false)
  })
})
