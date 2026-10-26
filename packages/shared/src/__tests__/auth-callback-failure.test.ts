import { describe, expect, it, vi } from 'vitest'
import { AuthCallbackError, createAuthCallbackFailureReporter, readAuthCallbackInput, type AuthCallbackFailureReason } from '../utils/auth-callback-failure'

describe('auth callback input', () => {
  it('prioritizes a provider error over missing credentials', () => {
    expect(readAuthCallbackInput(true, undefined, undefined)).toEqual({ reason: 'provider_error' })
  })

  it.each([undefined, null, '', 123, ['duplicate']])('rejects an invalid code: %s', (code) => {
    expect(readAuthCallbackInput(false, code, 'state')).toEqual({ reason: 'missing_code' })
  })

  it.each([undefined, null, '', 123, ['duplicate']])('rejects an invalid state: %s', (state) => {
    expect(readAuthCallbackInput(false, 'code', state)).toEqual({ reason: 'missing_state' })
  })

  it('preserves valid credentials for the exchange owner', () => {
    expect(readAuthCallbackInput(false, 'code+value', 'state/value')).toEqual({ reason: null, code: 'code+value', state: 'state/value' })
  })
})

describe.each(['apple', 'google'] as const)('%s callback failure reporting', (provider) => {
  it.each<AuthCallbackFailureReason>(['missing_code', 'missing_state', 'provider_error', 'state_mismatch',
    'exchange_failed', 'session_changed', 'profile_hydration_failed'])('reports %s once per callback attempt', (reason) => {
    const capture = vi.fn()
    const report = createAuthCallbackFailureReporter(provider, capture)
    const error = new AuthCallbackError(reason)
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe(reason)
    report(error.reason)
    report('session_changed')
    expect(capture).toHaveBeenCalledExactlyOnceWith('auth_callback_failed', { level: 'error', tags: { provider, reason } })
    createAuthCallbackFailureReporter(provider, capture)(reason)
    expect(capture).toHaveBeenCalledTimes(2)
  })
})
