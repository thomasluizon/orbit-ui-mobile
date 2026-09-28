import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { googleCodeAuthResponseSchema } from '@orbit/shared/types/auth'

const mocks = vi.hoisted(() => ({ apiClient: vi.fn(), open: vi.fn(), random: vi.fn(), digest: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))
vi.mock('expo-web-browser', () => ({
  openAuthSessionAsync: mocks.open,
  WebBrowserResultType: { DISMISS: 'dismiss', CANCEL: 'cancel' },
}))
vi.mock('expo-crypto', () => ({
  getRandomBytesAsync: mocks.random,
  digestStringAsync: mocks.digest,
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
}))

import { clearPendingGoogleAuthSession, hasPendingGoogleAuthSession } from '@/lib/google-auth-callback'
import { completeGoogleAuthFromUrl, getGoogleAuthRedirectUrl, startMobileGoogleAuth } from '@/lib/google-auth'

const callback = 'https://app.useorbit.org/auth-callback'
const loginResponse = { token: 'jwt', refreshToken: 'refresh', userId: 'user-1', name: 'Alex', email: 'alex@example.com' }

function authorizeUrl() {
  return new URL(mocks.open.mock.calls.at(-1)![0] as string)
}

describe('mobile Google authorization code flow', () => {
  beforeEach(() => {
    clearPendingGoogleAuthSession()
    vi.stubEnv('EXPO_PUBLIC_GOOGLE_CLIENT_ID', 'web-client-id')
    mocks.random.mockReset()
      .mockResolvedValueOnce(new Uint8Array(32).fill(1))
      .mockResolvedValueOnce(new Uint8Array(32).fill(2))
    mocks.digest.mockReset().mockImplementation((_algorithm: string, input: string) =>
      Promise.resolve(createHash('sha256').update(input).digest('base64')))
    mocks.open.mockReset().mockImplementation((_url: string, redirect: string) => {
      const state = authorizeUrl().searchParams.get('state')
      return Promise.resolve({ type: 'success', url: `${redirect}?code=google-code&state=${state}` })
    })
    mocks.apiClient.mockReset().mockResolvedValue(loginResponse)
  })

  it.each([false, true])('builds a %s authorize URL and exchanges the code', async (forceConsent) => {
    const result = await startMobileGoogleAuth({ forceConsent, returnUrl: forceConsent ? '/calendar-sync' : undefined })
    const url = authorizeUrl()
    expect(url.origin).toBe('https://accounts.google.com')
    expect(url.pathname).toBe('/o/oauth2/v2/auth')
    expect(url.searchParams.get('client_id')).toBe('web-client-id')
    expect(url.searchParams.get('redirect_uri')).toBe(callback)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe(forceConsent
      ? 'openid email profile https://www.googleapis.com/auth/calendar.readonly'
      : 'openid email profile')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBe(createHash('sha256').update('01'.repeat(32)).digest('base64url'))
    expect(url.searchParams.get('state')).toBe('02'.repeat(32))
    expect(url.searchParams.get('access_type')).toBe(forceConsent ? 'offline' : null)
    expect(url.searchParams.get('include_granted_scopes')).toBe(forceConsent ? 'true' : null)
    expect(url.searchParams.get('prompt')).toBe(forceConsent ? 'consent' : null)
    expect(mocks.open).toHaveBeenCalledWith(url.toString(), callback)
    expect(result.type).toBe('success')
    if (result.type !== 'success') return
    expect(await completeGoogleAuthFromUrl(result.url, 'pt-BR', 'REF123')).toEqual(loginResponse)
    expect(mocks.apiClient).toHaveBeenCalledWith('/api/auth/google/code', {
      method: 'POST',
      body: JSON.stringify({ code: 'google-code', codeVerifier: '01'.repeat(32), redirectUri: callback,
        language: 'pt-BR', referralCode: 'REF123' }),
    }, googleCodeAuthResponseSchema)
  })

  it('rejects a mismatched state without calling the API', async () => {
    mocks.open.mockResolvedValue({ type: 'success', url: `${callback}?code=google-code&state=wrong` })
    await expect(startMobileGoogleAuth({})).rejects.toThrow('Invalid OAuth state')
    await expect(completeGoogleAuthFromUrl(`${callback}?code=google-code&state=wrong`, 'en')).rejects.toThrow()
    expect(mocks.apiClient).not.toHaveBeenCalled()
  })

  it('returns the verified App Link and clears credentials when the browser is cancelled', async () => {
    expect(getGoogleAuthRedirectUrl()).toBe(callback)
    mocks.open.mockResolvedValue({ type: 'cancel' })

    await expect(startMobileGoogleAuth({})).resolves.toEqual({ type: 'cancel' })

    expect(mocks.open).toHaveBeenCalledWith(expect.any(String), callback)
    expect(hasPendingGoogleAuthSession()).toBe(false)
    expect(mocks.apiClient).not.toHaveBeenCalled()
  })

  it('rejects a Google error without calling the API', async () => {
    mocks.open.mockImplementation((url: string) => Promise.resolve({
      type: 'success', url: `${callback}?error=access_denied&state=${new URL(url).searchParams.get('state')}`,
    }))
    await expect(startMobileGoogleAuth({})).rejects.toThrow()
    expect(mocks.apiClient).not.toHaveBeenCalled()
  })

  it('does not create a session when the API rejects the code', async () => {
    const result = await startMobileGoogleAuth({})
    if (result.type !== 'success') throw new Error('Expected callback')
    mocks.apiClient.mockRejectedValue(new Error('API rejected'))
    await expect(completeGoogleAuthFromUrl(result.url, 'en')).rejects.toThrow('API rejected')
  })

  it('keeps the first browser attempt usable when a second start overlaps it', async () => {
    let resolveFirst: ((value: { type: string; url: string }) => void) | undefined
    mocks.random.mockResolvedValue(new Uint8Array(32).fill(3))
    mocks.open.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockRejectedValueOnce(new Error('browser already open'))
    const first = startMobileGoogleAuth({ returnUrl: '/calendar-sync' })
    await vi.waitFor(() => expect(mocks.open).toHaveBeenCalledTimes(1))
    const firstState = new URL(mocks.open.mock.calls[0]![0] as string).searchParams.get('state')
    await expect(startMobileGoogleAuth({})).rejects.toThrow()
    expect(mocks.open).toHaveBeenCalledTimes(1)
    resolveFirst?.({ type: 'success', url: `${callback}?code=first-code&state=${firstState}` })
    const result = await first
    expect(result.type).toBe('success')
    if (result.type !== 'success') return
    await expect(completeGoogleAuthFromUrl(result.url, 'en')).resolves.toEqual(loginResponse)
  })
})
