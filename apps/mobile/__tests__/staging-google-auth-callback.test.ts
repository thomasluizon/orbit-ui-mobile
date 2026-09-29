import { afterEach, describe, expect, it, vi } from 'vitest'

describe('staging Google callback', () => {
  afterEach(() => {
    vi.doUnmock('expo-constants')
    vi.resetModules()
  })

  it('uses the staging App Link and rejects the production callback', async () => {
    vi.doMock('expo-constants', () => ({
      default: { expoConfig: { extra: { router: { origin: 'https://app-staging.useorbit.org' } } } },
    }))
    vi.resetModules()
    const callback = await import('@/lib/google-auth-callback')

    expect(callback.AUTH_CALLBACK_URL).toBe('https://app-staging.useorbit.org/auth-callback')
    callback.markPendingGoogleAuthSession(1, 'verifier', 'expected')
    expect(callback.setPendingGoogleAuthCallbackUrl(
      'https://app.useorbit.org/auth-callback?code=old&state=expected', 1,
    )).toBe(false)
    expect(callback.setPendingGoogleAuthCallbackUrl(
      'https://app-staging.useorbit.org/auth-callback?code=new&state=expected', 1,
    )).toBe(true)
  })
})
