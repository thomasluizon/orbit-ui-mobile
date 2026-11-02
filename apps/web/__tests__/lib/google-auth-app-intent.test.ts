import { describe, expect, it } from 'vitest'
import { getGoogleAuthAppIntent } from '@/lib/google-auth-app-intent'

const callback = { protocol: 'https:', host: 'app.useorbit.org', search: '?code=code&state=state' }
const input = { callback, userAgent: 'Android', pendingWebState: null, packageName: 'org.useorbit.app' }

describe('Google callback intent boundary', () => {
  it('forwards fragment-only Apple credentials in the Android intent query', () => {
    expect(getGoogleAuthAppIntent({ ...input, callback: { ...callback, search: '', hash: '#provider=apple&handoff=h%2Bvalue&state=s' } })).toBe(
      'intent://app.useorbit.org/auth-callback?provider=apple&handoff=h%2Bvalue&state=s#Intent;scheme=https;package=org.useorbit.app;end',
    )
  })

  it.each([undefined, '', 'org.useorbit.app;S.extra=unsafe', 'org/useorbit/app'])('rejects invalid package configuration %s', (packageName) => {
    expect(getGoogleAuthAppIntent({ ...input, packageName })).toBeNull()
  })
  it.each(['?code=code', '?state=state', '?error=access_denied'])('requires a state and callback payload: %s', (search) => {
    expect(getGoogleAuthAppIntent({ ...input, callback: { ...callback, search } })).toBeNull()
  })
  it('leaves desktop and non-https callbacks on the web', () => {
    expect(getGoogleAuthAppIntent({ ...input, userAgent: 'Mozilla/5.0 (Windows NT 10.0)' })).toBeNull()
    expect(getGoogleAuthAppIntent({ ...input, callback: { ...callback, protocol: 'http:' } })).toBeNull()
  })
})
