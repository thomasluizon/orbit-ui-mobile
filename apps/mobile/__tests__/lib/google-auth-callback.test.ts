import { beforeEach, describe, expect, it } from 'vitest'
import {
  AUTH_CALLBACK_URL,
  clearPendingGoogleAuthSession,
  extractGoogleAuthParams,
  getPendingGoogleAuthVerifier,
  markPendingGoogleAuthSession,
  resolveGoogleAuthCallbackUrl,
  setPendingGoogleAuthCallbackUrl,
} from '@/lib/google-auth-callback'

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

  it('recovers a callback URL from Expo Router params', () => {
    const url = `${AUTH_CALLBACK_URL}?code=google-code&state=expected`
    expect(resolveGoogleAuthCallbackUrl({ rawUrl: null, params: { code: 'google-code', state: 'expected' } })).toBe(url)
    expect(resolveGoogleAuthCallbackUrl({ rawUrl: AUTH_CALLBACK_URL, params: {} })).toBeNull()
  })
})
