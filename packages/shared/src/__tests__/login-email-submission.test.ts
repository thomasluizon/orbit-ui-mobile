import { describe, expect, it } from 'vitest'
import * as login from '../utils/auth-login'

describe('deriveLoginEmailSubmission', () => {
  it('allows a valid address without recorded attempts', () => {
    expect(login.deriveLoginEmailSubmission('person@example.com', new Map(), 1_000))
      .toEqual({ status: 'ready' })
  })

  it('rejects an invalid address on every submission', () => {
    const attempts = new Map<string, login.LoginAttempts>()
    expect(login.deriveLoginEmailSubmission('invalid', attempts, 1_000))
      .toEqual({ status: 'invalid' })
    expect(login.deriveLoginEmailSubmission('invalid', attempts, 2_000))
      .toEqual({ status: 'invalid' })
  })

  it('validates the address before considering its lock', () => {
    const attempts = new Map([['invalid', { count: 3, expiresAt: 5_000 }]])
    expect(login.deriveLoginEmailSubmission('invalid', attempts, 1_000))
      .toEqual({ status: 'invalid' })
  })

  it.each([3, 4])('locks after %s attempts and rounds remaining seconds up', (count) => {
    const attempts = new Map([['person@example.com', { count, expiresAt: 5_001 }]])
    expect(login.deriveLoginEmailSubmission('person@example.com', attempts, 1_000))
      .toEqual({ status: 'locked', remainingSeconds: 5 })
  })

  it('normalizes the address when looking up its lock without changing attempts', () => {
    const attempts = new Map([['person@example.com', { count: 3, expiresAt: 5_000 }]])
    expect(login.deriveLoginEmailSubmission(' Person@Example.com ', attempts, 1_000))
      .toEqual({ status: 'locked', remainingSeconds: 4 })
    expect([...attempts]).toEqual([['person@example.com', { count: 3, expiresAt: 5_000 }]])
  })

  it('allows an address below the lock threshold', () => {
    const attempts = new Map([['person@example.com', { count: 2, expiresAt: 5_000 }]])
    expect(login.deriveLoginEmailSubmission('person@example.com', attempts, 1_000))
      .toEqual({ status: 'ready' })
  })

  it.each([5_000, 5_001])('allows an expired lock at time %s', (now) => {
    const attempts = new Map([['person@example.com', { count: 3, expiresAt: 5_000 }]])
    expect(login.deriveLoginEmailSubmission('person@example.com', attempts, now))
      .toEqual({ status: 'ready' })
  })

  it('does not use another address lock', () => {
    const attempts = new Map([['another@example.com', { count: 3, expiresAt: 5_000 }]])
    expect(login.deriveLoginEmailSubmission('person@example.com', attempts, 1_000))
      .toEqual({ status: 'ready' })
  })
})
