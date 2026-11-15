import { describe, expect, it, vi } from 'vitest'
import { AuthCallbackError, createAuthCallbackFailureReporter, isAuthCallbackCancel, readAuthCallbackInput, type AuthCallbackFailureReason } from '../utils/auth-callback-failure'
import { showsAuthCallbackLine } from '../utils/auth-login'

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

describe('a provider cancel', () => {
  it.each(['access_denied', 'cancel', 'dismiss'])('reads %s as the person leaving the consent screen', (error) => {
    expect(isAuthCallbackCancel(error)).toBe(true)
  })

  it.each(['server_error', 'invalid_request', '', null, undefined])('reads %s as no cancel', (error) => {
    expect(isAuthCallbackCancel(error)).toBe(false)
  })

  it('shows the provider line of the current surface after a failure and after a cancel only', () => {
    expect(showsAuthCallbackLine({ state: 'failed' })).toBe(true)
    expect(showsAuthCallbackLine({ state: 'cancelled' })).toBe(true)
    expect(showsAuthCallbackLine({ state: 'pending' })).toBe(false)
    expect(showsAuthCallbackLine({ state: 'account' })).toBe(false)
    expect(showsAuthCallbackLine(undefined)).toBe(false)
  })
})
