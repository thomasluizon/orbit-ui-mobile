import React from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  AUTH_CALLBACK_URL,
  allowGoogleErrorLogin,
  buildGoogleAuthFallbackUrl,
  clearPendingGoogleAuthSession,
  clearPendingGoogleAuthSessionForLogin,
  clearGoogleErrorLogin,
  extractGoogleAuthParams,
  getPendingGoogleAuthVerifier,
  hasGoogleAuthCallbackPayload,
  hasPendingGoogleAuthSession,
  markPendingGoogleAuthSession,
  resolveGoogleAuthCallbackUrl,
  setPendingGoogleAuthCallbackUrl,
  useGoogleErrorLogin,
  usePendingGoogleAuthSession,
} from '@/lib/google-auth-callback'

const TestRenderer = require('react-test-renderer')

describe('Google App Link callback state', () => {
  beforeEach(() => clearPendingGoogleAuthSession())

  it('accepts one matching callback and retains its verifier for exchange', () => {
    markPendingGoogleAuthSession(1, 'verifier', 'expected')
    const url = `${AUTH_CALLBACK_URL}?code=google-code&state=expected`
    expect(setPendingGoogleAuthCallbackUrl(url, 1)).toBe(true)
    expect(getPendingGoogleAuthVerifier('expected')).toBe('verifier')
    expect(extractGoogleAuthParams(url)).toEqual({
      code: 'google-code', state: 'expected', error: undefined, error_description: undefined,
    })
    clearPendingGoogleAuthSession(1)
    expect(getPendingGoogleAuthVerifier('expected')).toBeNull()
  })

  it('rejects mismatched state, duplicate state, and foreign callback origins', () => {
    markPendingGoogleAuthSession(1, 'verifier', 'expected')
    expect(setPendingGoogleAuthCallbackUrl(`${AUTH_CALLBACK_URL}?code=x&state=wrong`, 1)).toBe(false)
    expect(setPendingGoogleAuthCallbackUrl(`${AUTH_CALLBACK_URL}?code=x&state=expected&state=expected`, 1)).toBe(false)
    expect(setPendingGoogleAuthCallbackUrl('https://other.example/auth-callback?code=x&state=expected', 1)).toBe(false)
    expect(getPendingGoogleAuthVerifier('wrong')).toBeNull()
  })

  it('does not let an older browser result clear a newer attempt', () => {
    markPendingGoogleAuthSession(1, 'old', 'old-state')
    markPendingGoogleAuthSession(2, 'new', 'new-state')
    clearPendingGoogleAuthSession(1)
    expect(setPendingGoogleAuthCallbackUrl(`${AUTH_CALLBACK_URL}?code=new&state=new-state`, 1)).toBe(false)
    expect(setPendingGoogleAuthCallbackUrl(`${AUTH_CALLBACK_URL}?code=new&state=new-state`, 2)).toBe(true)
    expect(getPendingGoogleAuthVerifier('new-state')).toBe('new')
  })

  it('clears an unprocessed Google attempt when another login establishes the session', () => {
    markPendingGoogleAuthSession(1, 'verifier', 'expected')
    clearPendingGoogleAuthSessionForLogin()
    expect(hasPendingGoogleAuthSession()).toBe(false)
    expect(getPendingGoogleAuthVerifier('expected')).toBeNull()
    expect(setPendingGoogleAuthCallbackUrl(`${AUTH_CALLBACK_URL}?code=x&state=expected`, 1)).toBe(false)
  })

  it('recovers a callback URL from Expo Router params', () => {
    const url = `${AUTH_CALLBACK_URL}?code=google-code&state=expected`
    expect(resolveGoogleAuthCallbackUrl({ rawUrl: null, params: { code: 'google-code', state: 'expected' } })).toBe(url)
    expect(resolveGoogleAuthCallbackUrl({ rawUrl: AUTH_CALLBACK_URL, params: {} })).toBeNull()
  })

  it('rejects callback delivery before an attempt and preserves an active attempt after a stale clear', () => {
    const url = `${AUTH_CALLBACK_URL}?code=google-code&state=expected`
    expect(hasPendingGoogleAuthSession()).toBe(false)
    expect(setPendingGoogleAuthCallbackUrl(url)).toBe(false)
    markPendingGoogleAuthSession(2, 'verifier', 'expected')
    expect(hasPendingGoogleAuthSession()).toBe(true)
    clearPendingGoogleAuthSession(1)
    expect(getPendingGoogleAuthVerifier('expected')).toBe('verifier')
    expect(setPendingGoogleAuthCallbackUrl(url)).toBe(true)
  })

  it('accepts Google error callbacks and rejects a matching state on the wrong path', () => {
    markPendingGoogleAuthSession(1, 'verifier', 'expected')
    expect(setPendingGoogleAuthCallbackUrl('https://app.useorbit.org/login?code=x&state=expected')).toBe(false)
    const errorUrl = `${AUTH_CALLBACK_URL}?error=access_denied&error_description=cancelled&state=expected`
    expect(setPendingGoogleAuthCallbackUrl(errorUrl)).toBe(true)
    expect(extractGoogleAuthParams(errorUrl)).toEqual({
      code: undefined, state: 'expected', error: 'access_denied', error_description: 'cancelled',
    })
    expect(hasGoogleAuthCallbackPayload(extractGoogleAuthParams(errorUrl))).toBe(true)
  })

  it('uses a payload-bearing session URL before raw and router fallbacks', () => {
    const sessionUrl = `${AUTH_CALLBACK_URL}?code=session&state=expected`
    const rawUrl = `${AUTH_CALLBACK_URL}?code=raw&state=expected`
    expect(resolveGoogleAuthCallbackUrl({ sessionCallbackUrl: sessionUrl, rawUrl, params: { code: 'router' } })).toBe(sessionUrl)
    expect(resolveGoogleAuthCallbackUrl({ sessionCallbackUrl: AUTH_CALLBACK_URL, rawUrl, params: { code: 'router' } })).toBe(rawUrl)
    expect(resolveGoogleAuthCallbackUrl({ sessionCallbackUrl: AUTH_CALLBACK_URL, rawUrl: AUTH_CALLBACK_URL, params: { error: 'access_denied', state: 'expected' } }))
      .toBe(`${AUTH_CALLBACK_URL}?error=access_denied&state=expected`)
  })

  it('ignores array-valued router params and empty callback payloads', () => {
    expect(buildGoogleAuthFallbackUrl({ code: ['one', 'two'], state: undefined })).toBeNull()
    expect(buildGoogleAuthFallbackUrl({ code: 'valid', state: ['invalid'] }, 'https://example.org/auth-callback'))
      .toBe('https://example.org/auth-callback?code=valid')
    expect(hasGoogleAuthCallbackPayload({ state: 'expected' })).toBe(false)
  })

  it('notifies mounted auth views when the pending callback and error login state change', () => {
    const snapshots: { pending: boolean; callbackUrl: string | null; errorAllowed: boolean }[] = []
    function AuthObserver() {
      const session = usePendingGoogleAuthSession()
      const errorAllowed = useGoogleErrorLogin()
      snapshots.push({ pending: session.isPending, callbackUrl: session.callbackUrl, errorAllowed })
      return React.createElement('AuthObserver')
    }
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(React.createElement(AuthObserver)) })
    TestRenderer.act(() => { markPendingGoogleAuthSession(1, 'verifier', 'expected') })
    expect(snapshots.at(-1)).toEqual({ pending: true, callbackUrl: null, errorAllowed: false })
    const callbackUrl = `${AUTH_CALLBACK_URL}?code=google-code&state=expected`
    TestRenderer.act(() => { setPendingGoogleAuthCallbackUrl(callbackUrl) })
    expect(snapshots.at(-1)).toEqual({ pending: false, callbackUrl, errorAllowed: false })
    TestRenderer.act(() => { allowGoogleErrorLogin() })
    expect(snapshots.at(-1)?.errorAllowed).toBe(true)
    TestRenderer.act(() => { clearGoogleErrorLogin() })
    expect(snapshots.at(-1)?.errorAllowed).toBe(false)
    TestRenderer.act(() => { tree.unmount() })
  })
})
