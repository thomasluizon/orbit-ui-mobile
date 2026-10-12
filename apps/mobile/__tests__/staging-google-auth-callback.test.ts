import { afterEach, describe, expect, it, vi } from 'vitest'

describe('staging Google callback', () => {
  afterEach(() => {
    vi.doUnmock('expo-constants')
    vi.doUnmock('expo-web-browser')
    vi.doUnmock('expo-crypto')
    vi.doUnmock('@/lib/api-client')
    vi.resetModules()
  })

  it('uses the staging App Link and rejects the production callback', async () => {
    vi.doMock('expo-constants', () => ({
      default: { expoConfig: { extra: { router: { origin: 'https://app-staging.useorbit.org' } } } },
    }))
    vi.resetModules()
    const callback = await import('@/lib/google-auth-callback')

    expect(callback.AUTH_CALLBACK_URL).toBe('https://app-staging.useorbit.org/auth-callback')
    await callback.markPendingGoogleAuthSession('attempt', 'verifier', 'expected')
    expect(callback.setPendingGoogleAuthCallbackUrl(
      'https://app.useorbit.org/auth-callback?code=old&state=expected', 'attempt',
    )).toBe(false)
    expect(callback.setPendingGoogleAuthCallbackUrl(
      'https://app-staging.useorbit.org/auth-callback?code=new&state=expected', 'attempt',
    )).toBe(true)
  })
  it.each(['https://app.useorbit.org', 'https://app-staging.useorbit.org'])
  ('exchanges the https URL delivered by a package-targeted intent on %s with the stored verifier', async (origin) => {
    vi.doMock('expo-constants', () => ({ default: { expoConfig: { extra: { router: { origin } } } } }))
    vi.doMock('expo-web-browser', () => ({}))
    vi.doMock('expo-crypto', () => ({}))
    const response = { token: 'access', refreshToken: 'refresh', userId: 'user-1', name: 'A', email: 'a@example.com' }
    const apiClient = vi.fn().mockResolvedValue(response)
    vi.doMock('@/lib/api-client', () => ({ apiClient }))
    vi.resetModules()
    const callback = await import('@/lib/google-auth-callback')
    const { completeGoogleAuthFromUrl } = await import('@/lib/google-auth')
    const { googleCodeAuthResponseSchema } = await import('@orbit/shared/types/auth')
    const deliveredUrl = `${origin}/auth-callback?code=mobile%2Bcode&state=expected&scope=openid+email&authuser=1`
    await callback.markPendingGoogleAuthSession('intent-attempt', 'phone-verifier', 'expected')
    expect(callback.setPendingGoogleAuthCallbackUrl(deliveredUrl, 'intent-attempt')).toBe(true)

    await expect(completeGoogleAuthFromUrl(deliveredUrl, 'pt-BR')).resolves.toEqual(response)
    expect(apiClient).toHaveBeenCalledWith('/api/auth/google/code', {
      method: 'POST', body: JSON.stringify({ code: 'mobile+code', codeVerifier: 'phone-verifier',
        redirectUri: `${origin}/auth-callback`, language: 'pt-BR' }),
    }, googleCodeAuthResponseSchema)
    await expect(completeGoogleAuthFromUrl(`${origin}/auth-callback?code=code&state=wrong`, 'pt-BR'))
      .rejects.toThrow('Invalid OAuth state')
    expect(apiClient).toHaveBeenCalledOnce()
    await callback.clearPendingGoogleAuthSession()
  })

})
